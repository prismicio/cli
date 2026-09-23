import { getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { getDirtyPaths, getGitRoot } from "../lib/git";
import { getCustomTypes, getSlices } from "../lib/prismic/clients/custom-types";
import { getProfile } from "../lib/prismic/clients/user";
import { diffModels, type ModelsDiff } from "../lib/prismic/models";
import { isDescendant, relativePathname } from "../lib/url";
import { findProjectRoot, getRepositoryName } from "../project";

const config = {
	name: "prismic status",
	description: `
		Show local vs remote model differences.

		Reports what would be pushed to or pulled from Prismic, plus any local
		model files with uncommitted git changes that must be committed before
		pull and push.
	`,
	options: {
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

	const repositoryName = await getRepositoryName();
	const activeEnvironment = await adapter.getEnvironment();
	const { env, repo = env ?? activeEnvironment ?? repositoryName } = values;

	const { token, host } = await getCredentials();
	const projectRoot = await findProjectRoot();

	const [gitRoot, customTypeLibraries, sliceLibraries, local] = await Promise.all([
		getGitRoot(projectRoot),
		adapter.getCustomTypeLibraries(),
		adapter.getSliceLibraries(),
		adapter.getModels(),
	]);

	let userEmail: string | undefined;
	let diff: ModelsDiff | undefined;
	if (token) {
		const [profile, remoteCustomTypes, remoteSlices] = await Promise.all([
			getProfile({ token, host }),
			getCustomTypes({ repo, token, host }),
			getSlices({ repo, token, host }),
		]);
		userEmail = profile.email;
		diff = diffModels(local, { customTypes: remoteCustomTypes, slices: remoteSlices });
	}

	let dirtyModelFiles: string[] = [];
	if (gitRoot) {
		const dirtyPaths = await getDirtyPaths(gitRoot);
		dirtyModelFiles = dirtyPaths
			.filter(
				(path) =>
					(path.pathname.endsWith("/model.json") &&
						sliceLibraries.some((lib) => isDescendant(lib, path))) ||
					(path.pathname.endsWith("/index.json") &&
						customTypeLibraries.some((lib) => isDescendant(lib, path))),
			)
			.map((path) => relativePathname(projectRoot, path));
	}

	console.info(`Repository: ${repositoryName}`);
	if (repo !== repositoryName) {
		console.info(`Environment: ${repo}`);
	}
	if (userEmail) {
		console.info(`Authenticated as: ${userEmail}`);
	} else {
		console.info("Not logged in — log in with `prismic login` to compare with remote.");
	}

	const inSync =
		diff !== undefined &&
		diff.customTypes.insert.length === 0 &&
		diff.customTypes.update.length === 0 &&
		diff.customTypes.delete.length === 0 &&
		diff.slices.insert.length === 0 &&
		diff.slices.update.length === 0 &&
		diff.slices.delete.length === 0;

	if (inSync && dirtyModelFiles.length === 0) {
		console.info("");
		console.info("Already up to date.");
		return;
	}

	if (diff) {
		const sections: string[][] = [];
		const onlyLocal = [
			...diff.customTypes.insert.map((m) => `  ${m.id} (custom type)`),
			...diff.slices.insert.map((m) => `  ${m.id} (slice)`),
		];
		if (onlyLocal.length > 0) sections.push(["Local-only:", ...onlyLocal]);
		const onlyRemote = [
			...diff.customTypes.delete.map((m) => `  ${m.id} (custom type)`),
			...diff.slices.delete.map((m) => `  ${m.id} (slice)`),
		];
		if (onlyRemote.length > 0) sections.push(["Remote-only:", ...onlyRemote]);
		const differ = [
			...diff.customTypes.update.map((m) => `  ${m.id} (custom type)`),
			...diff.slices.update.map((m) => `  ${m.id} (slice)`),
		];
		if (differ.length > 0) sections.push(["Differ:", ...differ]);
		for (const lines of sections) {
			console.info("");
			for (const line of lines) console.info(line);
		}
	}

	const next: string[] = [];
	if (dirtyModelFiles.length > 0) {
		console.info("");
		console.info(
			"Prismic keeps model history in git. Commit model changes before you push or pull them.",
		);
		next.push(`git add ${dirtyModelFiles.join(" ")}`);
		next.push(`git commit -m "Update Prismic models"`);
	}
	if (diff && !inSync) {
		const pushI = diff.customTypes.insert.length + diff.slices.insert.length;
		const pushU = diff.customTypes.update.length + diff.slices.update.length;
		const pushD = diff.customTypes.delete.length + diff.slices.delete.length;
		next.push(`prismic push  # creates ${pushI}, updates ${pushU}, deletes ${pushD}`);
		next.push(`prismic pull  # creates ${pushD}, updates ${pushU}, deletes ${pushI}`);
	}

	if (next.length > 0) {
		console.info("");
		console.info("Next:");
		for (const line of next) console.info(`  ${line}`);
	}
});
