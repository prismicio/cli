import { getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import { getGitRoot } from "../lib/git";
import { getCustomTypes, getSlices } from "../lib/prismic/clients/custom-types";
import {
	canonicalizeCustomType,
	canonicalizeSlice,
	getDirtyModelFiles,
} from "../lib/prismic/models";
import { completeOnboardingSteps } from "../lib/prismic/onboarding";
import { relativePathname } from "../lib/url";
import { findProjectRoot, getRepositoryName } from "../project";

const config = {
	name: "prismic pull",
	description: `
		Pull content types and slices from Prismic to local files.

		Remote models are the source of truth. Local files are created, updated,
		or deleted to match.

		Run \`prismic docs view cli#pull-models-from-prismic\` for details.
	`,
	options: {
		force: {
			type: "boolean",
			short: "f",
			description: "Skip the git history check and overwrite local changes",
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

	console.info(`Pulling from repository: ${repo}`);

	const [gitRoot, customTypeLibraries, sliceLibraries] = await Promise.all([
		getGitRoot(projectRoot),
		adapter.getCustomTypeLibraries(),
		adapter.getSliceLibraries(),
	]);

	if (!force && gitRoot) {
		const dirtyFiles = await getDirtyModelFiles({
			gitRoot,
			projectRoot,
			customTypeLibraries,
			sliceLibraries,
		});

		if (dirtyFiles.length > 0) {
			throw new CommandError(`
				Local model files have uncommitted changes. Prismic keeps model history in
				git. Commit model changes before you pull them, so this pull can't discard
				your edits:

				  git add ${dirtyFiles.join(" ")}
				  git commit -m "Update Prismic models"
				  prismic pull

				Other options:
				  prismic push --force   Keep local edits, overwrite remote
				  prismic pull --force   Discard local edits, adopt remote
			`);
		}
	}

	const [localCustomTypes, localSlices, remoteCustomTypes, remoteSlices] = await Promise.all([
		adapter.getCustomTypes(),
		adapter.getSlices(),
		getCustomTypes({ repo, token, host }),
		getSlices({ repo, token, host }),
	]);
	// Local models are compared as written, so non-canonical files get rewritten.
	const customTypeOps = diffArrays(
		remoteCustomTypes,
		localCustomTypes.map((customType) => customType.model),
		canonicalizeCustomType,
		(local) => local,
	);
	const sliceOps = diffArrays(
		remoteSlices,
		localSlices.map((slice) => slice.model),
		canonicalizeSlice,
		(local) => local,
	);

	if (!force && !gitRoot) {
		const customTypeIds = new Set(
			[...customTypeOps.update, ...customTypeOps.delete].map((op) => op.id),
		);
		const sliceIds = new Set([...sliceOps.update, ...sliceOps.delete].map((op) => op.id));
		const affectedFiles = [
			...localCustomTypes.filter((c) => customTypeIds.has(c.model.id)),
			...localSlices.filter((s) => sliceIds.has(s.model.id)),
		].map((meta) => relativePathname(projectRoot, meta.modelPath));

		if (affectedFiles.length > 0) {
			throw new CommandError(`
				Pull would modify or delete local model files:
				  ${affectedFiles.join("\n")}

				This project isn't in a git repo, so changes can't be tracked. Choose one:
				  prismic pull --force   Discard local files, adopt remote
				  prismic push --force   Keep local files, overwrite remote
			`);
		}
	}

	for (const model of customTypeOps.insert) await adapter.createCustomType(model);
	for (const model of customTypeOps.update) await adapter.updateCustomType(model);
	for (const model of customTypeOps.delete) await adapter.deleteCustomType(model.id);
	for (const model of sliceOps.insert) await adapter.createSlice(model);
	for (const model of sliceOps.update) await adapter.updateSlice(model);
	for (const model of sliceOps.delete) await adapter.deleteSlice(model.id);

	await adapter.generateTypes();

	await completeOnboardingSteps(["connectPrismic"], {
		repo: await getRepositoryName(),
		token,
		host,
	}).catch(() => {});

	const isUpToDate = [customTypeOps, sliceOps].every(
		(ops) => ops.insert.length + ops.update.length + ops.delete.length === 0,
	);
	if (isUpToDate) {
		console.info("Already up to date.");
		return;
	}

	console.info(
		`Inserted ${customTypeOps.insert.length}, updated ${customTypeOps.update.length}, deleted ${customTypeOps.delete.length} types`,
	);
	console.info(
		`Inserted ${sliceOps.insert.length}, updated ${sliceOps.update.length}, deleted ${sliceOps.delete.length} slices`,
	);
});
