import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { pascalCase } from "change-case";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getDocumentTotalByCustomTypes } from "../clients/core";
import {
	deleteScreenshots,
	getCustomTypes,
	getSlices,
	insertCustomType,
	insertSlice,
	removeCustomType,
	removeSlice,
	updateCustomType,
	updateSlice,
} from "../clients/custom-types";
import { completeOnboardingStepsSilently, type OnboardingStep } from "../clients/repository";
import { getWorkingDocumentsUrlForCustomType, getCustomTypeListUrl } from "../clients/wroom";
import { getEnvironment } from "../environments";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import { getDirtyPaths, getGitRoot } from "../lib/git";
import { BadRequestError } from "../lib/request";
import { appendTrailingSlash, isDescendant, relativePathname } from "../lib/url";
import { canonicalizeModel } from "../models";
import { findProjectRoot, getRepositoryName } from "../project";

const config = {
	name: "prismic push",
	description: `
		Push local content types and slices to Prismic.

		Local models are the source of truth. Remote models are created,
		updated, or deleted to match.
	`,
	options: {
		force: { type: "boolean", short: "f", description: "Skip safety checks" },
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: { type: "string", short: "e", description: "(deprecated) Alias for --repo" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { env, force = false, repo = env ?? (await getEnvironment()) ?? (await getRepositoryName()) } = values;

	const token = await getToken();
	const host = await getHost();
	const adapter = await getAdapter();
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
				Local model files have uncommitted changes. Commit them, then push:

				  git add ${dirtyFiles.join(" ")}
				  git commit -m "Update Prismic models"
				  prismic push

				Or skip the safety check with \`prismic push --force\`.
			`);
		}
	}

	const [localCustomTypes, localSlices, remoteCustomTypes, remoteSlices] = await Promise.all([
		adapter.getCustomTypes(),
		adapter.getSlices(),
		getCustomTypes({ repo, token, host }),
		getSlices({ repo, token, host }),
	]);
	const customTypeOps = diffArrays(
		localCustomTypes.map((customType) => customType.model),
		remoteCustomTypes,
		{
			getKey: (model) => model.id,
			equals: (a, b) =>
				JSON.stringify(canonicalizeModel(a)) === JSON.stringify(canonicalizeModel(b)),
		},
	);
	const sliceOps = diffArrays(
		localSlices.map((slice) => slice.model),
		remoteSlices,
		{
			getKey: (model) => model.id,
			equals: (a, b) =>
				JSON.stringify(canonicalizeModel(a)) === JSON.stringify(canonicalizeModel(b)),
		},
	);

	if (!force) {
		const customTypeLibrary = appendTrailingSlash(customTypeLibraries[0]);
		const sliceLibrary = appendTrailingSlash(sliceLibraries[0]);
		const deletedFiles = [
			...customTypeOps.delete.map((m) =>
				relativePathname(projectRoot, new URL(`${m.id}/index.json`, customTypeLibrary)),
			),
			...sliceOps.delete.map((m) =>
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

	for (const model of customTypeOps.insert) {
		await insertCustomType(model, { repo, token, host });
	}
	for (const model of customTypeOps.update) {
		await updateCustomType(model, { repo, token, host });
	}
	for (const model of customTypeOps.delete) {
		await removeCustomTypeWithDocumentHandling(model, { repo, token, host });
	}
	for (const model of sliceOps.insert) {
		await insertSlice(model, { repo, token, host });
	}
	for (const model of sliceOps.update) {
		await updateSlice(model, { repo, token, host });
	}
	for (const id of sliceOps.delete.map((m) => m.id)) {
		await removeSlice(id, { repo, token, host });
		await deleteScreenshots(id, { repo, token, host }).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`Failed to delete screenshots for slice "${id}": ${message}`);
		});
	}

	const onboardingSteps: OnboardingStep[] = [];
	if (sliceOps.insert.length > 0) {
		onboardingSteps.push("createSlice");
	}
	if (customTypeOps.insert.some((model) => model.format === "page")) {
		onboardingSteps.push("createPageType");
	}
	if (onboardingSteps.length > 0) {
		await completeOnboardingStepsSilently({
			repo,
			token,
			host,
			stepIds: onboardingSteps,
		});
	}

	const totalTypes = customTypeOps.insert.length + customTypeOps.update.length;
	const totalSlices = sliceOps.insert.length + sliceOps.update.length;
	const totalDeletes = customTypeOps.delete.length + sliceOps.delete.length;
	if (totalTypes === 0 && totalSlices === 0 && totalDeletes === 0) {
		console.info("Already up to date.");
	} else {
		console.info(`Pushed ${totalTypes} type(s), ${totalSlices} slice(s).`);
		if (totalDeletes > 0) console.info(`Deleted ${totalDeletes} model(s).`);
	}
});

async function removeCustomTypeWithDocumentHandling(
	model: CustomType,
	config: {
		repo: string;
		token: string | undefined;
		host: string;
	},
): Promise<void> {
	const { repo, token, host } = config;
	const { id, format } = model;

	try {
		await removeCustomType(id, { repo, token, host });
	} catch (error) {
		if (!(await isDocumentsInUseError(error))) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new CommandError(
				`Could not delete type "${id}": ${errorMessage}"` +
					"\nPlease try again, or manually deleting the type at: " +
					getCustomTypeListUrl({ repo, host, format: format ?? "custom" }),
			);
		}

		let documentCount: number;
		try {
			documentCount = await getDocumentTotalByCustomTypes(id, { repo, token, host });
		} catch {
			throw new CommandError(
				`Could not check whether type "${id}" has associated pages. ` +
					"\nPlease try again, or manually delete any associated pages at: " +
					getWorkingDocumentsUrlForCustomType({ repo, host, customTypeId: id }),
			);
		}

		const countLabel = documentCount > 0 ? ` ${documentCount}` : "";
		const pluralPages = documentCount === 1 ? "page" : "pages";
		throw new CommandError(
			`Could not delete type "${id}" because it has${countLabel} associated ${pluralPages}. ` +
				`\nDelete any associated pages manually before pushing at: ` +
				getWorkingDocumentsUrlForCustomType({ repo, host, customTypeId: id }),
		);
	}
}

async function isDocumentsInUseError(error: unknown): Promise<boolean> {
	if (!(error instanceof BadRequestError)) return false;
	const body = await error.text();
	return body.includes("associated documents") || body.includes("Delete all documents belonging");
}
