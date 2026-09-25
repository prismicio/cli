import type { DynamicCustomTypeModel } from "@prismicio/types-internal";
import { pascalCase } from "change-case";
import * as z from "zod/mini";

import { getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getDirtyPaths, getGitRoot } from "../lib/git";
import { getDocumentTotalByCustomTypes } from "../lib/prismic/clients/core";
import {
	type BulkChange,
	bulkUpdate,
	type CustomTypesConfig,
	deleteScreenshots,
} from "../lib/prismic/clients/custom-types";
import { diffModels, getRemoteModels, type ModelsDiff } from "../lib/prismic/models";
import { completeOnboardingSteps, type OnboardingStep } from "../lib/prismic/onboarding";
import { ForbiddenRequestError } from "../lib/request";
import { appendTrailingSlash, isDescendant, relativePathname } from "../lib/url";
import { findProjectRoot, getRepositoryName } from "../project";

const config = {
	name: "prismic push",
	description: `
		Push local content types and slices to Prismic.

		Local models are the source of truth. Remote models are created,
		updated, or deleted to match.

		Prismic keeps model history in git. Commit model changes before you push
		them. Pushing creates and updates models and never changes documents.
		Deleting a remote model needs --force.

		Run \`prismic docs view cli#push-models-to-prismic\` for details.
	`,
	options: {
		force: {
			type: "boolean",
			short: "f",
			description: "Skip the git history and deletion checks",
		},
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: {
			type: "string",
			short: "e",
			description: "Alias for --repo",
			deprecated: "Use `prismic env` or --repo instead.",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const adapter = await getAdapter();

	const {
		force = false,
		env,
		repo = env ?? (await adapter.getEnvironment()) ?? (await getRepositoryName()),
	} = values;

	const { token, host } = await getCredentials();
	const projectRoot = await findProjectRoot();

	console.info(`Pushing to repository: ${repo}`);

	const [gitRoot, customTypeLibraries, sliceLibraries] = await Promise.all([
		getGitRoot(projectRoot),
		adapter.getCustomTypeLibraries(),
		adapter.getSliceLibraries(),
	]);

	if (!force && gitRoot) {
		const dirtyPaths = await getDirtyPaths(gitRoot);
		const dirtyFiles = dirtyPaths
			.filter(
				(path) =>
					(path.pathname.endsWith("/model.json") &&
						sliceLibraries.some((lib) => isDescendant(lib, path))) ||
					(path.pathname.endsWith("/index.json") &&
						customTypeLibraries.some((lib) => isDescendant(lib, path))),
			)
			.map((path) => relativePathname(projectRoot, path));

		if (dirtyFiles.length > 0) {
			throw new CommandError(`
				Local model files have uncommitted changes. Prismic keeps model history in
				git. Commit model changes before you push them:

				  git add ${dirtyFiles.join(" ")}
				  git commit -m "Update Prismic models"
				  prismic push

				Or skip the check with \`prismic push --force\`.
			`);
		}
	}

	const [local, remote] = await Promise.all([
		adapter.getModels(),
		getRemoteModels({ repo, token, host }),
	]);
	const diff = diffModels(local, remote);

	if (!force) {
		const customTypeLibrary = appendTrailingSlash(customTypeLibraries[0]);
		const sliceLibrary = appendTrailingSlash(sliceLibraries[0]);
		const deletedFiles = [
			...diff.customTypes.delete.map((m) =>
				relativePathname(projectRoot, new URL(`${m.id}/index.json`, customTypeLibrary)),
			),
			...diff.slices.delete.map((m) =>
				relativePathname(projectRoot, new URL(`${pascalCase(m.name)}/model.json`, sliceLibrary)),
			),
		];
		if (deletedFiles.length > 0) {
			throw new CommandError(`
				Push would delete remote models. Re-run with --force to proceed.

				Models that would be deleted:
				  ${deletedFiles.join("\n")}
			`);
		}
	}

	try {
		await writeRemoteModels(diff, { repo, token, host });
	} catch (error) {
		throw await explainExistingDocuments(error, diff.customTypes.delete, { repo, token, host });
	}
	for (const { id } of diff.slices.delete) {
		await deleteScreenshots(id, { repo, token, host }).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(
				`Failed to delete screenshots for slice "${id}"${message ? `: ${message}` : "."}`,
			);
		});
	}

	const onboardingSteps: OnboardingStep[] = [];
	if (diff.slices.insert.length > 0) {
		onboardingSteps.push("createSlice");
	}
	if (diff.customTypes.insert.some((model) => model.format === "page")) {
		onboardingSteps.push("createPageType");
	}
	if (onboardingSteps.length > 0) {
		await completeOnboardingSteps(onboardingSteps, {
			repo: await getRepositoryName(),
			token,
			host,
		}).catch(() => {});
	}

	const totalTypes = diff.customTypes.insert.length + diff.customTypes.update.length;
	const totalSlices = diff.slices.insert.length + diff.slices.update.length;
	const totalDeletes = diff.customTypes.delete.length + diff.slices.delete.length;
	if (totalTypes === 0 && totalSlices === 0 && totalDeletes === 0) {
		console.info("Already up to date.");
	} else {
		console.info(`Pushed ${totalTypes} type(s), ${totalSlices} slice(s).`);
		if (totalDeletes > 0) console.info(`Deleted ${totalDeletes} model(s).`);
	}
});

async function writeRemoteModels(
	{ customTypes, slices }: ModelsDiff,
	config: CustomTypesConfig,
): Promise<void> {
	const change = (type: BulkChange["type"], payload: BulkChange["payload"]) => ({
		type,
		id: payload.id,
		payload,
	});
	const changes = [
		...customTypes.insert.map((model) => change("CUSTOM_TYPE_INSERT", model)),
		...customTypes.update.map((model) => change("CUSTOM_TYPE_UPDATE", model)),
		...customTypes.delete.map(({ id }) => change("CUSTOM_TYPE_DELETE", { id })),
		...slices.insert.map((model) => change("SLICE_INSERT", model)),
		...slices.update.map((model) => change("SLICE_UPDATE", model)),
		...slices.delete.map(({ id }) => change("SLICE_DELETE", { id })),
	];
	if (changes.length > 0) await bulkUpdate(changes, config);
}

const ExistingDocumentsErrorSchema = z.object({ hasExistingDocuments: z.literal(true) });

async function explainExistingDocuments(
	error: unknown,
	deletedCustomTypes: DynamicCustomTypeModel[],
	config: { repo: string; token: string | undefined; host: string },
): Promise<unknown> {
	if (!(error instanceof ForbiddenRequestError)) return error;
	if (!z.safeParse(ExistingDocumentsErrorSchema, error.body).success) return error;

	const { repo, host } = config;
	for (const { id } of deletedCustomTypes) {
		const documentsUrl = getWorkingDocumentsUrlForCustomType({ repo, host, customTypeId: id });

		let documentCount: number;
		try {
			documentCount = await getDocumentTotalByCustomTypes(id, config);
		} catch {
			return new CommandError(
				`Could not check whether type "${id}" has associated pages. ` +
					"\nPlease try again, or manually delete any associated pages at: " +
					documentsUrl,
			);
		}
		if (documentCount === 0) continue;

		const pluralPages = documentCount === 1 ? "page" : "pages";
		return new CommandError(
			`Could not delete type "${id}" because it has ${documentCount} associated ${pluralPages}. ` +
				`\nDelete any associated pages manually before pushing at: ` +
				documentsUrl,
		);
	}
	return error;
}

function getWorkingDocumentsUrlForCustomType(args: {
	repo: string;
	host: string;
	customTypeId: string;
}): string {
	const { repo, host, customTypeId } = args;
	const url = new URL("builder/working", `https://${repo}.${host}/`);
	url.searchParams.set("customTypes", customTypeId);
	return url.href;
}
