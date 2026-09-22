import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { diffArrays, type ArrayDiff } from "../lib/diff";
import { getDirtyPaths, getGitRoot } from "../lib/git";
import { getCustomTypes, getSlices } from "../lib/prismic/clients/custom-types";
import { getProfile } from "../lib/prismic/clients/user";
import { canonicalizeCustomType, canonicalizeSlice } from "../lib/prismic/models";
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
	const { env, repo = env ?? (await adapter.getEnvironment()) ?? repositoryName } = values;

	const { token, host } = await getCredentials();
	const projectRoot = await findProjectRoot();

	const [gitRoot, customTypeLibraries, sliceLibraries, localCustomTypesMeta, localSlicesMeta] =
		await Promise.all([
			getGitRoot(projectRoot),
			adapter.getCustomTypeLibraries(),
			adapter.getSliceLibraries(),
			adapter.getCustomTypes(),
			adapter.getSlices(),
		]);

	let userEmail: string | undefined;
	let customTypeOps: ArrayDiff<CustomType> | undefined;
	let sliceOps: ArrayDiff<SharedSlice> | undefined;
	if (token) {
		const [profile, remoteCustomTypes, remoteSlices] = await Promise.all([
			getProfile({ token, host }),
			getCustomTypes({ repo, token, host }),
			getSlices({ repo, token, host }),
		]);
		userEmail = profile.email;
		customTypeOps = diffArrays(
			localCustomTypesMeta.map((ct) => ct.model),
			remoteCustomTypes,
			{
				getKey: (m) => m.id,
				equals: (a, b) =>
					JSON.stringify(canonicalizeCustomType(a)) === JSON.stringify(canonicalizeCustomType(b)),
			},
		);
		sliceOps = diffArrays(
			localSlicesMeta.map((s) => s.model),
			remoteSlices,
			{
				getKey: (m) => m.id,
				equals: (a, b) =>
					JSON.stringify(canonicalizeSlice(a)) === JSON.stringify(canonicalizeSlice(b)),
			},
		);
	}

	let dirtyModelFiles: string[] = [];
	if (gitRoot) {
		dirtyModelFiles = (await getDirtyPaths(gitRoot))
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
		customTypeOps !== undefined &&
		sliceOps !== undefined &&
		[customTypeOps, sliceOps].every(
			(ops) => ops.insert.length + ops.update.length + ops.delete.length === 0,
		);

	if (inSync && dirtyModelFiles.length === 0) {
		console.info("");
		console.info("Already up to date.");
		return;
	}

	if (customTypeOps && sliceOps) {
		const sections = [
			["Local-only:", "insert"],
			["Remote-only:", "delete"],
			["Differ:", "update"],
		] as const;
		for (const [heading, key] of sections) {
			const lines = [
				...customTypeOps[key].map((model) => `  ${model.id} (custom type)`),
				...sliceOps[key].map((model) => `  ${model.id} (slice)`),
			];
			if (lines.length === 0) continue;
			console.info("");
			console.info(heading);
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
	if (customTypeOps && sliceOps && !inSync) {
		const inserts = customTypeOps.insert.length + sliceOps.insert.length;
		const updates = customTypeOps.update.length + sliceOps.update.length;
		const deletes = customTypeOps.delete.length + sliceOps.delete.length;
		next.push(`prismic push  # creates ${inserts}, updates ${updates}, deletes ${deletes}`);
		next.push(`prismic pull  # creates ${deletes}, updates ${updates}, deletes ${inserts}`);
	}

	if (next.length > 0) {
		console.info("");
		console.info("Next:");
		for (const line of next) console.info(`  ${line}`);
	}
});
