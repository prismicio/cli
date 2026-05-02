import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { getProfile } from "../clients/user";
import { resolveEnvironment } from "../environments";
import { createCommand, type CommandConfig } from "../lib/command";
import { diffArrays, type ArrayDiff } from "../lib/diff";
import { getDirtyPaths, getGitRoot } from "../lib/git";
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
		env: { type: "string", short: "e", description: "Environment domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo: parentRepo = await getRepositoryName(), env } = values;

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

	let repo = parentRepo;
	let userEmail: string | undefined;
	let customTypeOps: ArrayDiff<CustomType> | undefined;
	let sliceOps: ArrayDiff<SharedSlice> | undefined;
	if (token) {
		if (env) {
			repo = await resolveEnvironment(env, { repo: parentRepo, token, host });
		}
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

	console.info(`Repository: ${parentRepo}`);
	if (env) {
		console.info(`Environment: ${env}`);
	}
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
				Pull and push won't run while these model files have uncommitted git changes:
				  ${dirtyModelFiles.join("\n")}

				To unblock, commit them:
				  git add ${dirtyModelFiles.join(" ")}
				  git commit -m "Update Prismic models"

				Or override with \`prismic push --force\` (keep local) or \`prismic pull --force\` (discard local).
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
