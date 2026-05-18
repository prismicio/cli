import { pascalCase } from "change-case";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import {
	deleteDocumentsByCustomType,
	getDocumentTotalByCustomTypes,
} from "../clients/core";
import {
	getCustomTypes,
	getSlices,
	insertCustomType,
	insertSlice,
	removeCustomType,
	removeSlice,
	updateCustomType,
	updateSlice,
} from "../clients/custom-types";
import {
	completeOnboardingStepsSilently,
	type OnboardingStep,
} from "../clients/repository";
import { getWorkingDocumentsUrlForCustomType } from "../clients/wroom";
import { resolveEnvironment } from "../environments";
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
		force: { type: "boolean", short: "f", description: "Skip overwrite safety checks" },
		"delete-pages": {
			type: "boolean",
			description:
				"Confirm the bulk-deletion of associated pages when removing a type",
		},
		repo: { type: "string", short: "r", description: "Repository domain" },
		env: { type: "string", short: "e", description: "Environment domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const {
		force = false,
		"delete-pages": deletePages = false,
		repo: parentRepo = await getRepositoryName(),
		env,
	} = values;

	const token = await getToken();
	const host = await getHost();
	const adapter = await getAdapter();
	const projectRoot = await findProjectRoot();

	const repo = env ? await resolveEnvironment(env, { repo: parentRepo, token, host }) : parentRepo;

	console.info(`Pushing to repository: ${parentRepo}${env ? ` (env: ${env})` : ""}`);

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
		await removeCustomTypeWithDocumentHandling(model.id, {
			repo,
			token,
			host,
			deletePages,
		});
	}
	for (const model of sliceOps.insert) {
		await insertSlice(model, { repo, token, host });
	}
	for (const model of sliceOps.update) {
		await updateSlice(model, { repo, token, host });
	}
	for (const id of sliceOps.delete.map((m) => m.id)) {
		await removeSlice(id, { repo, token, host });
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
			repo: parentRepo,
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

const DELETE_PAGES_LIMIT = 200; // same hard limit from type builder and sm-api

async function removeCustomTypeWithDocumentHandling(
	id: string,
	config: {
		repo: string;
		token: string | undefined;
		host: string;
		deletePages: boolean;
	},
): Promise<void> {
	const { repo, token, host, deletePages: forceDeletePages } = config;
	try {
		await removeCustomType(id, { repo, token, host });
	} catch (error) {
		if (!isDocumentsInUseError(error)) throw error;

		let documentCount: number;
		try {
			documentCount = await getDocumentTotalByCustomTypes(id, { repo, token, host });
		} catch {
			throw new CommandError(
				`Failed to check whether type "${id}" has associated pages. ` +
					"Please try pushing again, or manually delete any associated pages in Prismic: " + getWorkingDocumentsUrlForCustomType({ repo, host, customTypeId: id }),
			);
		}

		if (documentCount === 0) {
			try {
				await removeCustomType(id, { repo, token, host });
				return;
			} catch (retryError) {
				if (!isDocumentsInUseError(retryError)) throw retryError;
				throw new CommandError(
					`Unable to delete type "${id}". It may have associated pages. ` +
						`Please try pushing again, or manually delete any associated pages in Prismic: ` + getWorkingDocumentsUrlForCustomType({ repo, host, customTypeId: id }),
				);
			}
		}

		if (documentCount > DELETE_PAGES_LIMIT) {
			const plural = documentCount === 1 ? "" : "s";
			throw new CommandError(
				`Cannot delete type "${id}": it has ${documentCount} associated page${plural}, ` +
					`which exceeds the limit of ${DELETE_PAGES_LIMIT} that can be bulk-deleted. ` +
					`Delete pages manually before pushing: ` + getWorkingDocumentsUrlForCustomType({ repo, host, customTypeId: id }),
			);
		}

		if (!forceDeletePages) {
			const plural = documentCount === 1 ? "" : "s";
			throw new CommandError(
				`Type "${id}" has ${documentCount} associated page${plural}. ` +
					`Deleting it type will also permanently delete all associated pages: \n` + getWorkingDocumentsUrlForCustomType({ repo, host, customTypeId: id }) + "\n\n" +
					`Pass --delete-pages to confirm this cascading deletion.`,
			);
			
		}

		console.info(`Deleting pages associated with type "${id}"...`);
		await deleteDocumentsByCustomType(id, { repo, token, host });
		await removeCustomType(id, { repo, token, host });
	}
}

function isDocumentsInUseError(error: unknown): error is BadRequestError {
	if (!(error instanceof BadRequestError)) return false;
	const { body } = error;
	return (
		typeof body === "string" &&
		(body.includes("associated documents") || body.includes("Delete all documents belonging"))
	);
}
