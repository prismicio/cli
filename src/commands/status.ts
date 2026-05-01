import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { getProfile } from "../clients/user";
import { createCommand, type CommandConfig } from "../lib/command";
import { diffArrays, type ArrayDiff } from "../lib/diff";
import { getDirtyTrackedPaths, getGitRoot } from "../lib/git";
import { dedent } from "../lib/string";
import { isDescendant, relativePathname } from "../lib/url";
import { findProjectRoot, getRepositoryName } from "../project";

const config = {
	name: "prismic status",
	description: `
		Show local vs remote model differences.

		Reports what would be pushed to or pulled from Prismic, plus any local
		model files with uncommitted git changes that would block pull and push.
	`,
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const adapter = await getAdapter();
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
			{ getKey: (m) => m.id },
		);
		sliceOps = diffArrays(
			localSlicesMeta.map((s) => s.model),
			remoteSlices,
			{ getKey: (m) => m.id },
		);
	}

	let dirtyModelFiles: string[] = [];
	if (gitRoot) {
		const dirtyTrackedPaths = await getDirtyTrackedPaths(gitRoot);
		dirtyModelFiles = dirtyTrackedPaths
			.filter(
				(path) =>
					(path.pathname.endsWith("/model.json") &&
						sliceLibraries.some((lib) => isDescendant(lib, path))) ||
					(path.pathname.endsWith("/index.json") &&
						customTypeLibraries.some((lib) => isDescendant(lib, path))),
			)
			.map((path) => relativePathname(projectRoot, path));
	}

	console.info(`Repository: ${repo}`);
	if (userEmail) {
		console.info(`Authenticated as: ${userEmail}`);
	} else {
		console.info("Not logged in — log in with `prismic login` to compare with remote.");
	}

	const inSync =
		customTypeOps !== undefined &&
		sliceOps !== undefined &&
		customTypeOps.insert.length === 0 &&
		customTypeOps.update.length === 0 &&
		customTypeOps.delete.length === 0 &&
		sliceOps.insert.length === 0 &&
		sliceOps.update.length === 0 &&
		sliceOps.delete.length === 0;

	if (inSync && dirtyModelFiles.length === 0) {
		console.info("");
		console.info("Already up to date.");
		return;
	}

	if (customTypeOps && sliceOps) {
		const sections: string[][] = [];
		const onlyLocal = [
			...customTypeOps.insert.map((m) => `  ${m.id} (custom type)`),
			...sliceOps.insert.map((m) => `  ${m.id} (slice)`),
		];
		if (onlyLocal.length > 0) sections.push(["Local-only:", ...onlyLocal]);
		const onlyRemote = [
			...customTypeOps.delete.map((m) => `  ${m.id} (custom type)`),
			...sliceOps.delete.map((m) => `  ${m.id} (slice)`),
		];
		if (onlyRemote.length > 0) sections.push(["Remote-only:", ...onlyRemote]);
		const differ = [
			...customTypeOps.update.map((m) => `  ${m.id} (custom type)`),
			...sliceOps.update.map((m) => `  ${m.id} (slice)`),
		];
		if (differ.length > 0) sections.push(["Differ:", ...differ]);
		for (const lines of sections) {
			console.info("");
			for (const line of lines) console.info(line);
		}
	}

	if (dirtyModelFiles.length > 0) {
		console.info("");
		console.info(
			dedent`
				Sync blocked

				Pull and push won't run while these model files have uncommitted git changes:
				  ${dirtyModelFiles.join("\n  ")}

				Why: a pull would overwrite your edits, a push would commit half-finished work to Prismic.

				To unblock, choose one:
				  Keep your local edits and overwrite remote:
				    prismic push --force

				  Discard your local edits and adopt remote:
				    prismic pull --force

				  Merge by hand:
				    1. git stash
				    2. prismic pull
				    3. git stash pop
				    4. Resolve JSON conflicts in your editor
				    5. prismic push
			`,
		);
	}

	if (customTypeOps && sliceOps && !inSync) {
		const pushI = customTypeOps.insert.length + sliceOps.insert.length;
		const pushU = customTypeOps.update.length + sliceOps.update.length;
		const pushD = customTypeOps.delete.length + sliceOps.delete.length;
		console.info("");
		console.info("Next:");
		console.info(`  prismic push  — would create ${pushI}, update ${pushU}, delete ${pushD}`);
		console.info(`  prismic pull  — would create ${pushD}, update ${pushU}, delete ${pushI}`);
	}
});
