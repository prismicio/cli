import { createHash } from "node:crypto";
import { mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import { sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
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
import { getCustomTypes, getSlices, insertCustomType, updateCustomType } from "./prismic";

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

it("asks to continue when a model changed in both places", async ({
	expect,
	prismic,
	project,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);
	const releaseId = await startAndCrash(prismic, expect);
	await writeLocalCustomType(project, { ...customType, label: "Local" });
	await updateCustomType(
		{ ...customType, label: "Type Builder" },
		{ repo, token, host, releaseId },
	);

	const restart = await prismic("dev");
	expect(restart.exitCode).toBe(1);
	expect(restart.stderr).toContain("prismic dev --continue");
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

it("syncs a type and a slice with the same ID", async ({
	expect,
	prismic,
	project,
	repo,
	token,
	host,
}) => {
	const customType = buildCustomType();
	await writeLocalCustomType(project, customType);
	await writeLocalSlice(project, buildSlice({ id: customType.id }));

	const { output, releaseId } = await startSession(prismic, expect);

	await writeLocalCustomType(project, { ...customType, label: "Edited" });
	await expect.poll(output, { timeout: 30_000 }).toContain(`Pushed ${customType.id}`);
	const releaseTypes = await getCustomTypes({ repo, token, host, releaseId });
	expect(releaseTypes.find((m) => m.id === customType.id)?.label).toBe("Edited");
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

it.skipIf(process.platform === "win32")(
	"keeps the release with --keep and attaches to it with --release",
	async ({ expect, prismic, project, repo, token, host }) => {
		const localType = buildCustomType();
		await writeLocalCustomType(project, localType);

		const kept = await startSession(prismic, expect, ["--keep"]);
		expect(kept.output()).toContain(`Release: ${kept.releaseId}`);
		expect(kept.output()).toContain(
			`Page Builder: https://${repo}.${host}/builder/upcoming/${kept.releaseId}`,
		);
		kept.proc.kill("SIGINT");
		await kept.proc;
		expect(kept.output()).toContain(`Kept release ${kept.releaseId}`);

		const releaseOnlyType = buildCustomType();
		await insertCustomType(releaseOnlyType, { repo, token, host, releaseId: kept.releaseId });

		const attached = await startSession(prismic, expect, ["--release", kept.releaseId]);
		expect(attached.releaseId).toBe(kept.releaseId);
		expect(attached.output()).toContain(`Pulled ${releaseOnlyType.id}`);
		expect(await readLocalCustomType(project, releaseOnlyType.id)).toMatchObject(releaseOnlyType);
		attached.proc.kill("SIGINT");
		await attached.proc;

		const releaseTypeIds = (
			await getCustomTypes({ repo, token, host, releaseId: kept.releaseId })
		).map((m) => m.id);
		expect(releaseTypeIds.sort()).toEqual([localType.id, releaseOnlyType.id].sort());
	},
	90_000,
);

it("fails to attach to a missing release", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("dev", ["--release", "missing", "--no-browser"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Release not found: missing");
});

it("sends model requests to the PRISMIC_STAGE preview", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("dev", ["--no-browser"], {
		nodeOptions: { env: { PRISMIC_STAGE: "pull-0" } },
	});
	expect(exitCode).toBe(1);
	expect(stdout).not.toContain("Type Builder:");
	expect(stderr).toContain("The session ended.");
});

describe("with an isolated repository", () => {
	it.scoped({ isolateRepo: true });

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
		await expect.poll(output, { timeout: 30_000 }).toContain(`Pulled ${builderType.id}`);

		const editedType = { ...builderType, label: "Edited" };
		await updateCustomType(editedType, { repo, token, host, releaseId });
		await expect
			.poll(() => readLocalCustomType(project, builderType.id), { timeout: 30_000 })
			.toMatchObject(editedType);
	}, 90_000);
});

async function startSession(
	prismic: Fixtures["prismic"],
	expect: ExpectStatic,
	args: string[] = [],
	env?: Record<string, string>,
) {
	const proc = prismic("dev", [...args, "--no-browser"], { nodeOptions: { env } });
	const output = captureOutput(proc);
	const deadline = Date.now() + 30_000;
	while (!output().includes("Type Builder:")) {
		expect(proc.exitCode, `prismic dev exited early:\n${output()}`).toBeUndefined();
		expect(Date.now(), `prismic dev did not start:\n${output()}`).toBeLessThan(deadline);
		await sleep(100);
	}
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
