import { pascalCase } from "change-case";

import { getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import { getDirtyPaths, getGitRoot } from "../lib/git";
import { getDocumentTotalByCustomTypes } from "../lib/prismic/clients/core";
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
} from "../lib/prismic/clients/custom-types";
import { canonicalizeCustomType, canonicalizeSlice } from "../lib/prismic/models";
import { completeOnboardingSteps, type OnboardingStep } from "../lib/prismic/onboarding";
import { BadRequestError } from "../lib/request";
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
		force,
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
		const dirtyFiles = (await getDirtyPaths(gitRoot))
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
				JSON.stringify(canonicalizeCustomType(a)) === JSON.stringify(canonicalizeCustomType(b)),
		},
	);
	const sliceOps = diffArrays(
		localSlices.map((slice) => slice.model),
		remoteSlices,
		{
			getKey: (model) => model.id,
			equals: (a, b) =>
				JSON.stringify(canonicalizeSlice(a)) === JSON.stringify(canonicalizeSlice(b)),
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

	for (const model of customTypeOps.insert) await insertCustomType(model, { repo, token, host });
	for (const model of customTypeOps.update) await updateCustomType(model, { repo, token, host });
	for (const { id, format } of customTypeOps.delete) {
		await removeCustomType(id, { repo, token, host }).catch(async (error) => {
			const body = error instanceof BadRequestError ? await error.text() : "";
			if (
				!body.includes("associated documents") &&
				!body.includes("Delete all documents belonging")
			) {
				const typesPath = format === "page" ? "page-types" : "custom-types";
				const typesUrl = new URL(`builder/types/${typesPath}`, `https://${repo}.${host}/`);
				const errorMessage = error instanceof Error ? error.message : String(error);
				throw new CommandError(
					`Could not delete type "${id}": ${errorMessage}"` +
						"\nPlease try again, or manually deleting the type at: " +
						typesUrl.href,
				);
			}

			const documentsUrl = new URL("builder/working", `https://${repo}.${host}/`);
			documentsUrl.searchParams.set("customTypes", id);
			const documentCount = await getDocumentTotalByCustomTypes(id, { repo, token, host }).catch(
				() => {
					throw new CommandError(
						`Could not check whether type "${id}" has associated pages. ` +
							"\nPlease try again, or manually delete any associated pages at: " +
							documentsUrl.href,
					);
				},
			);
			const countLabel = documentCount > 0 ? ` ${documentCount}` : "";
			const pluralPages = documentCount === 1 ? "page" : "pages";
			throw new CommandError(
				`Could not delete type "${id}" because it has${countLabel} associated ${pluralPages}. ` +
					`\nDelete any associated pages manually before pushing at: ` +
					documentsUrl.href,
			);
		});
	}
	for (const model of sliceOps.insert) await insertSlice(model, { repo, token, host });
	for (const model of sliceOps.update) await updateSlice(model, { repo, token, host });
	for (const { id } of sliceOps.delete) {
		await removeSlice(id, { repo, token, host });
		await deleteScreenshots(id, { repo, token, host }).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(
				`Failed to delete screenshots for slice "${id}"${message ? `: ${message}` : "."}`,
			);
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
		await completeOnboardingSteps(onboardingSteps, {
			repo: await getRepositoryName(),
			token,
			host,
		}).catch(() => {});
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
