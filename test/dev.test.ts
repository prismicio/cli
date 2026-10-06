import { createHash } from "node:crypto";
import { mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, type ExpectStatic } from "vitest";

import {
	buildCustomType,
	buildSlice,
	captureOutput,
	type Fixtures,
	it,
	readLocalCustomType,
	writeLocalCustomType,
	writeLocalSlice,
} from "./it";
import { getCustomTypes, getSlices, insertCustomType } from "./prismic";

// These tests need hidden releases (Wroom) and release-scoped models (Custom
// Types API) on the host the tests target.

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("dev", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic dev [options]");
});

it("fails when not logged in", async ({ expect, prismic, logout }) => {
	await logout();
	const { stderr, exitCode } = await prismic("dev");
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Not logged in");
});

it("refuses a second session in the same project", async ({ expect, prismic, project, home }) => {
	await writeSession(home, project, {
		repo: "unused",
		releaseId: "unused",
		pid: process.pid,
		synced: {},
	});
	const { stderr, exitCode } = await prismic("dev");
	expect(exitCode).toBe(1);
	expect(stderr).toContain("already running for this project");
});

it("deletes the release of a crashed session", async ({ expect, prismic, repo, token, host }) => {
	const crashed = await startAndCrash(prismic, expect);

	const { releaseId } = await startSession(prismic, expect);
	expect(releaseId).not.toBe(crashed);
	await expect(getCustomTypes({ repo, token, host, releaseId: crashed })).rejects.toThrow();
}, 60_000);

it("continues a crashed session with unpulled changes", async ({
	expect,
	prismic,
	project,
	repo,
	token,
	host,
}) => {
	const releaseId = await startAndCrash(prismic, expect);
	const builderType = buildCustomType();
	await insertCustomType(builderType, { repo, token, host, releaseId });

	const restart = await prismic("dev");
	expect(restart.exitCode).toBe(1);
	expect(restart.stderr).toContain("prismic dev --continue");

	const continued = await startSession(prismic, expect, ["--continue"]);
	expect(continued.releaseId).toBe(releaseId);
	expect(continued.output()).toContain(`Pulled ${builderType.id}`);
	expect(await readLocalCustomType(project, builderType.id)).toMatchObject(builderType);
}, 90_000);

it("discards a crashed session with --new", async ({ expect, prismic, repo, token, host }) => {
	const releaseId = await startAndCrash(prismic, expect);
	await insertCustomType(buildCustomType(), { repo, token, host, releaseId });

	const started = await startSession(prismic, expect, ["--new"]);
	expect(started.releaseId).not.toBe(releaseId);
	await expect(getCustomTypes({ repo, token, host, releaseId })).rejects.toThrow();
}, 90_000);

it("fails to continue without a session", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("dev", ["--continue"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("no session to continue");
});

it("sends local changes as soon as they are saved", async ({
	expect,
	prismic,
	project,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);

	const { output, releaseId } = await startSession(prismic, expect, [], {
		PRISMIC_SYNC_POLL_MS: "60000",
	});

	await writeLocalCustomType(project, { ...customType, label: "Edited" });
	await expect.poll(output, { timeout: 10_000 }).toContain("Pushed");
	const releaseTypes = await getCustomTypes({ repo, token, host, releaseId });
	expect(releaseTypes.find((m) => m.id === customType.id)?.label).toBe("Edited");
}, 60_000);

it.skipIf(process.platform === "win32")(
	"pulls the last changes when the session ends",
	async ({ expect, prismic, project, repo, token, host }) => {
		const { proc, releaseId } = await startSession(prismic, expect, [], {
			PRISMIC_SYNC_POLL_MS: "60000",
		});
		const builderType = buildCustomType();
		await insertCustomType(builderType, { repo, token, host, releaseId });

		proc.kill("SIGINT");
		await proc;
		expect(await readLocalCustomType(project, builderType.id)).toMatchObject(builderType);
	},
	60_000,
);

describe("with an isolated repository", () => {
	it.scoped({ isolateRepo: true });

	it("syncs local models with the Type Builder", async ({
		expect,
		prismic,
		project,
		home,
		repo,
		token,
		host,
	}) => {
		const localType = buildCustomType();
		const localSlice = buildSlice();
		const masterType = buildCustomType();
		await writeLocalCustomType(project, localType);
		await writeLocalSlice(project, localSlice);
		await insertCustomType(masterType, { repo, token, host });

		const { proc, output, releaseId } = await startSession(prismic, expect);
		expect(output()).toContain(`https://${repo}.${host}/builder/types?r=`);

		const releaseTypeIds = (await getCustomTypes({ repo, token, host, releaseId })).map(
			(m) => m.id,
		);
		expect(releaseTypeIds).toEqual([localType.id]);
		const releaseSliceIds = (await getSlices({ repo, token, host, releaseId })).map((m) => m.id);
		expect(releaseSliceIds).toEqual([localSlice.id]);
		const masterTypeIds = (await getCustomTypes({ repo, token, host })).map((m) => m.id);
		expect(masterTypeIds).toEqual([masterType.id]);

		const builderType = buildCustomType();
		await insertCustomType(builderType, { repo, token, host, releaseId });
		await expect.poll(output, { timeout: 30_000 }).toContain("Pulled");
		expect(await readLocalCustomType(project, builderType.id)).toMatchObject(builderType);

		const editedType = { ...localType, label: "Edited" };
		await writeLocalCustomType(project, editedType);
		await expect.poll(output, { timeout: 30_000 }).toContain("Pushed");
		const releaseTypes = await getCustomTypes({ repo, token, host, releaseId });
		expect(releaseTypes.find((m) => m.id === localType.id)?.label).toBe("Edited");

		// Windows has no SIGINT to send to a child process, so it can only kill it.
		if (process.platform === "win32") return;
		proc.kill("SIGINT");
		await proc;
		expect(proc.exitCode).toBe(0);
		await expect(getCustomTypes({ repo, token, host, releaseId })).rejects.toThrow();
		expect(await readdir(new URL(".config/prismic/dev/", home))).toEqual([]);
	}, 120_000);

	it("keeps syncing after a rejected change", async ({
		expect,
		prismic,
		project,
		repo,
		token,
		host,
	}) => {
		const customType = buildCustomType({ repeatable: true });
		await insertCustomType(customType, { repo, token, host });
		await writeLocalCustomType(project, customType);

		const { output, releaseId } = await startSession(prismic, expect);

		await writeLocalCustomType(project, { ...customType, repeatable: false });
		await expect.poll(output, { timeout: 30_000 }).toContain(`Could not push ${customType.id}:`);

		const builderType = buildCustomType();
		await insertCustomType(builderType, { repo, token, host, releaseId });
		await expect.poll(output, { timeout: 30_000 }).toContain("Pulled");
	}, 60_000);
});

async function startSession(
	prismic: Fixtures["prismic"],
	expect: ExpectStatic,
	args: string[] = [],
	env?: Record<string, string>,
) {
	const proc = prismic("dev", args, { nodeOptions: { env } });
	const output = captureOutput(proc);
	await expect.poll(output, { timeout: 30_000 }).toContain("Type Builder:");
	const releaseId = output().match(/\?r=(\S+)/)?.[1];
	if (!releaseId) throw new Error("No release in output");
	return { proc, output, releaseId };
}

async function startAndCrash(prismic: Fixtures["prismic"], expect: ExpectStatic): Promise<string> {
	const { proc, releaseId } = await startSession(prismic, expect);
	proc.kill("SIGKILL");
	await proc;
	return releaseId;
}

async function writeSession(home: URL, project: URL, session: object): Promise<void> {
	const projectRoot = (await realpath(fileURLToPath(project))) + sep;
	const projectHash = createHash("sha256").update(projectRoot).digest("hex");
	const dir = new URL(".config/prismic/dev/", home);
	await mkdir(dir, { recursive: true });
	await writeFile(new URL(`${projectHash}.json`, dir), JSON.stringify(session));
}
