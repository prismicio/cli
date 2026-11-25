import type { DynamicCustomTypeModel, SharedSliceModel } from "@prismicio/types-internal";
import { pascalCase } from "change-case";
import * as z from "zod/mini";

import { type Adapter, getAdapter } from "../adapters";
import { getHost, getToken, onUnauthorized } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getDirtyPaths, getGitRoot } from "../lib/git";
import {
	BulkUpdateErrorSchema,
	deleteSliceScreenshots,
	getDocumentTotalByCustomType,
} from "../lib/prismic/client";
import { diffModels, getRemoteModels, writeRemoteModels } from "../lib/prismic/models";
import { completeOnboardingSteps, type OnboardingStep } from "../lib/prismic/onboarding";
import { BadRequestError, ForbiddenRequestError } from "../lib/request";
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
	agents: `
		Use --force only when the user asks for it. It lets push delete remote
		models and skips the git check.
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

	const host = await getHost();
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
		getRemoteModels({ repo, getToken, host, onUnauthorized }),
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
		await writeRemoteModels(diff, { repo, getToken, host, onUnauthorized });
	} catch (error) {
		if (error instanceof BadRequestError) {
			throw await explainRejectedModels(error, adapter, projectRoot);
		}
		throw await explainExistingDocuments(error, diff.customTypes.delete, {
			repo,
			getToken,
			host,
			onUnauthorized,
		});
	}
	for (const { id } of diff.slices.delete) {
		await deleteSliceScreenshots(id, { repo, getToken, host, onUnauthorized }).catch((error) => {
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
			getToken,
			host,
			onUnauthorized,
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

async function explainRejectedModels(
	error: BadRequestError,
	adapter: Adapter,
	projectRoot: URL,
): Promise<Error> {
	const details = z.safeParse(BulkUpdateErrorSchema, error.body).data?.details;
	if (!details) return error;
	const [customTypes, slices] = await Promise.all([
		adapter.getCustomTypes(),
		adapter.getSlices(),
	]).catch(() => [[], []]);
	const rejections = [
		...details.customTypes.map((rejection) => ({
			...rejection,
			kind: "type" as const,
			local: customTypes.find(({ model }) => model.id === rejection.id),
		})),
		...details.slices.map((rejection) => ({
			...rejection,
			kind: "slice" as const,
			local: slices.find(({ model }) => model.id === rejection.id),
		})),
	];
	const problems = rejections.flatMap(({ kind, id, error, local }) => {
		const where = local
			? `${relativePathname(projectRoot, local.modelPath)} (${kind} "${id}")`
			: `${kind === "type" ? "Type" : "Slice"} "${id}"`;
		const descriptions = new Set(describeRejection(kind, error, local?.model));
		return [...descriptions].map((description) => `${where}: ${description}`);
	});
	const summary =
		rejections.length === 1
			? "Prismic rejected 1 model. Fix it and run `prismic push` again:"
			: `Prismic rejected ${rejections.length} models. Fix them and run \`prismic push\` again:`;
	return new CommandError([summary, ...problems].join("\n"));
}

function describeRejection(
	kind: "type" | "slice",
	error: string,
	model?: DynamicCustomTypeModel | SharedSliceModel,
): string[] {
	const paths = [...error.matchAll(/PATH: (\S*)\s+VALUE: (.*)/g)];
	if (paths.length > 0) {
		return paths.map(([, path, value]) => {
			const problem = describeInvalidPath(kind, path, model);
			return value === "undefined" ? problem : `${problem} Prismic got ${value}.`;
		});
	}
	if (error.endsWith("already exists")) {
		return ["It already exists in Prismic. The repository changed during the push."];
	}
	if (error.endsWith("could not be found")) {
		return ["It no longer exists in Prismic. The repository changed during the push."];
	}
	if (error === "api ID incorrect for uid field") {
		return ['The UID field must have the API ID "uid".'];
	}
	if (error.startsWith("You cannot update the repeatable property")) {
		const repeatable = model && "repeatable" in model ? (model.repeatable ?? true) : undefined;
		const fix = repeatable === undefined ? "" : ` Set it back to ${!repeatable}.`;
		return [`"repeatable" cannot change on a type that already exists.${fix}`];
	}
	return [error.replace(/\s+/g, " ").trim()];
}

// Prismic writes object keys as "/key" and list indexes as "|0|".
function describeInvalidPath(
	kind: "type" | "slice",
	path: string,
	model?: DynamicCustomTypeModel | SharedSliceModel,
): string {
	const keys = [...path.matchAll(/\/([^/|]+)|\|(\d+)\|/g)].map(([, key, index]) =>
		key === undefined ? Number(index) : key,
	);
	const [first, second, third, fourth] = keys;
	let rest = keys;
	let field: string | undefined;
	let fieldKind = "field";
	let place: string | undefined;
	if (kind === "type" && first === "json" && typeof second === "string") {
		place = `tab "${second}"`;
		if (typeof third === "string") field = third;
		rest = keys.slice(field ? 3 : 2);
	} else if (kind === "slice" && first === "variations" && typeof second === "number") {
		const id = model && "variations" in model ? model.variations[second]?.id : undefined;
		place = id ? `variation "${id}"` : `variation ${second + 1}`;
		if ((third === "primary" || third === "items") && typeof fourth === "string") {
			field = fourth;
			if (third === "items") fieldKind = "repeatable field";
		}
		rest = keys.slice(field ? 4 : 2);
	}
	while (field && rest[0] === "config" && rest[1] === "fields" && typeof rest[2] === "string") {
		field += `.${rest[2]}`;
		rest = rest.slice(3);
	}
	if (rest.some((key) => typeof key === "number")) {
		return `The value at ${path} is missing or not valid.`;
	}
	const subject = field ? `${fieldKind} "${field}" in ${place}` : place;
	const property = rest.length > 0 ? `The "${rest.join(".")}" property` : undefined;
	if (!subject) {
		return property ? `${property} is missing or not valid.` : "The model is not valid.";
	}
	if (!property) return `${subject[0].toUpperCase()}${subject.slice(1)} is missing or not valid.`;
	return `${property} of ${subject} is missing or not valid.`;
}

const ExistingDocumentsErrorSchema = z.object({ hasExistingDocuments: z.literal(true) });

async function explainExistingDocuments(
	error: unknown,
	deletedCustomTypes: DynamicCustomTypeModel[],
	config: Parameters<typeof getDocumentTotalByCustomType>[1],
): Promise<unknown> {
	if (!(error instanceof ForbiddenRequestError)) return error;
	if (!z.safeParse(ExistingDocumentsErrorSchema, error.body).success) return error;

	const { repo, host } = config;
	for (const { id } of deletedCustomTypes) {
		const documentsUrl = getWorkingDocumentsUrlForCustomType({ repo, host, customTypeId: id });

		let documentCount: number;
		try {
			documentCount = (await getDocumentTotalByCustomType(id, config)).total;
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
