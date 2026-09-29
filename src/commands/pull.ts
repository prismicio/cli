import { getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getDirtyPaths, getGitRoot } from "../lib/git";
import { diffModels, getRemoteModels } from "../lib/prismic/models";
import { completeOnboardingSteps } from "../lib/prismic/onboarding";
import { isDescendant, relativePathname } from "../lib/url";
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
		force = false,
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

	const [localCustomTypes, localSlices, remote] = await Promise.all([
		adapter.getCustomTypes(),
		adapter.getSlices(),
		getRemoteModels({ repo, token, host }),
	]);
	const diff = diffModels(
		remote,
		{
			customTypes: localCustomTypes.map((customType) => customType.model),
			slices: localSlices.map((slice) => slice.model),
		},
		{ treatNonCanonicalAsChanged: true },
	);

	if (!force && !gitRoot) {
		const customTypeIds = new Set(
			[...diff.customTypes.update, ...diff.customTypes.delete].map((op) => op.id),
		);
		const sliceIds = new Set([...diff.slices.update, ...diff.slices.delete].map((op) => op.id));
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

	const notices = await adapter.writeModels(diff);
	await adapter.generateTypes();

	await completeOnboardingSteps(["connectPrismic"], {
		repo: await getRepositoryName(),
		token,
		host,
	}).catch(() => {});

	const totalTypes = diff.customTypes.insert.length + diff.customTypes.update.length;
	const totalSlices = diff.slices.insert.length + diff.slices.update.length;
	const totalDeletes = diff.customTypes.delete.length + diff.slices.delete.length;

	for (const notice of notices) console.info(notice);

	if (totalTypes === 0 && totalSlices === 0 && totalDeletes === 0) {
		console.info("Already up to date.");
		return;
	}

	console.info(
		`Inserted ${diff.customTypes.insert.length}, updated ${diff.customTypes.update.length}, deleted ${diff.customTypes.delete.length} types`,
	);
	console.info(
		`Inserted ${diff.slices.insert.length}, updated ${diff.slices.update.length}, deleted ${diff.slices.delete.length} slices`,
	);
});
