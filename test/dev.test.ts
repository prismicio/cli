import { createHash } from "node:crypto";
import { mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe } from "vitest";

import {
	buildCustomType,
	buildSlice,
	captureOutput,
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
	await writeSession(home, project, { repo: "unused", releaseId: "unused", pid: process.pid });
	const { stderr, exitCode } = await prismic("dev");
	expect(exitCode).toBe(1);
	expect(stderr).toContain("already running in this project");
});

it("deletes the release of a crashed session", async ({ expect, prismic, repo, token, host }) => {
	const first = prismic("dev");
	const firstOutput = captureOutput(first);
	await expect.poll(firstOutput, { timeout: 30_000 }).toContain("Type Builder:");
	const firstRelease = getReleaseId(firstOutput());
	first.kill("SIGKILL");
	await first;

	const second = prismic("dev");
	const secondOutput = captureOutput(second);
	await expect.poll(secondOutput, { timeout: 30_000 }).toContain("Type Builder:");
	expect(getReleaseId(secondOutput())).not.toBe(firstRelease);
	await expect(getCustomTypes({ repo, token, host, releaseId: firstRelease })).rejects.toThrow();
}, 60_000);

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

	const proc = prismic("dev", [], { nodeOptions: { env: { PRISMIC_SYNC_POLL_MS: "60000" } } });
	const output = captureOutput(proc);
	await expect.poll(output, { timeout: 30_000 }).toContain("Type Builder:");
	const releaseId = getReleaseId(output());

	await writeLocalCustomType(project, { ...customType, label: "Edited" });
	await expect.poll(output, { timeout: 10_000 }).toContain("Sent to the Type Builder");
	const releaseTypes = await getCustomTypes({ repo, token, host, releaseId });
	expect(releaseTypes.find((m) => m.id === customType.id)?.label).toBe("Edited");
}, 60_000);

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

		const proc = prismic("dev");
		const output = captureOutput(proc);
		await expect.poll(output, { timeout: 30_000 }).toContain("Type Builder:");
		expect(output()).toContain(`https://${repo}.${host}/builder/types?r=`);
		const releaseId = getReleaseId(output());

		// The release matches the project, and master is unchanged.
		const releaseTypeIds = (await getCustomTypes({ repo, token, host, releaseId })).map(
			(m) => m.id,
		);
		expect(releaseTypeIds).toEqual([localType.id]);
		const releaseSliceIds = (await getSlices({ repo, token, host, releaseId })).map((m) => m.id);
		expect(releaseSliceIds).toEqual([localSlice.id]);
		const masterTypeIds = (await getCustomTypes({ repo, token, host })).map((m) => m.id);
		expect(masterTypeIds).toEqual([masterType.id]);

		// A Type Builder save is written to the project.
		const builderType = buildCustomType();
		await insertCustomType(builderType, { repo, token, host, releaseId });
		await expect.poll(output, { timeout: 30_000 }).toContain("Written from the Type Builder");
		expect(await readLocalCustomType(project, builderType.id)).toMatchObject(builderType);

		// A local change is sent to the release.
		const editedType = { ...localType, label: "Edited" };
		await writeLocalCustomType(project, editedType);
		await expect.poll(output, { timeout: 30_000 }).toContain("Sent to the Type Builder");
		const releaseTypes = await getCustomTypes({ repo, token, host, releaseId });
		expect(releaseTypes.find((m) => m.id === localType.id)?.label).toBe("Edited");

		// Stopping deletes the release and the session record. Windows has no
		// SIGINT to send to a child process, so it can only kill it.
		if (process.platform === "win32") return;
		proc.kill("SIGINT");
		await proc;
		expect(proc.exitCode).toBe(0);
		await expect(getCustomTypes({ repo, token, host, releaseId })).rejects.toThrow();
		expect(await readdir(new URL(".config/prismic/dev/", home))).toEqual([]);
	}, 120_000);

	it("explains that a type cannot change repeatable", async ({
		expect,
		prismic,
		project,
		repo,
		token,
		host,
	}) => {
		const customType = buildCustomType({ repeatable: true });
		await insertCustomType(customType, { repo, token, host });
		await writeLocalCustomType(project, { ...customType, repeatable: false });

		const { stderr, exitCode } = await prismic("dev");
		expect(exitCode).toBe(1);
		expect(stderr).toContain("can't switch between repeatable and single");
	}, 60_000);
});

function getReleaseId(output: string): string {
	const release = output.match(/\?r=(\S+)/)?.[1];
	if (!release) throw new Error("No release in output");
	return release;
}

async function writeSession(
	home: URL,
	project: URL,
	session: { repo: string; releaseId: string; pid: number },
): Promise<void> {
	const projectRoot = (await realpath(fileURLToPath(project))) + sep;
	const projectHash = createHash("sha256").update(projectRoot).digest("hex");
	const dir = new URL(".config/prismic/dev/", home);
	await mkdir(dir, { recursive: true });
	await writeFile(new URL(`${projectHash}.json`, dir), JSON.stringify(session));
}
