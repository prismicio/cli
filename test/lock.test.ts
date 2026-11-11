// Temporary. These unit tests cover the credentials lock until `prismic login`
// uses it. C4, the PR that switches `prismic login` to the device flow, deletes
// this file and tests login end to end instead.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, rename, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";

import { acquireLock, LockTimeoutError } from "../src/lib/lock";
import { it } from "./it";

// Node.js strips the types of the imported module.
function lockProcess(path: URL, script: string) {
	const lockModule = new URL("../src/lib/lock.ts", import.meta.url).href;
	const code = `
		import { acquireLock } from ${JSON.stringify(lockModule)};
		const path = new URL(process.argv[1]);
		${script}
	`;
	const child = spawn(
		process.execPath,
		["--no-warnings", "--input-type=module", "-e", code, path.href],
		{ stdio: ["pipe", "pipe", "inherit"] },
	);
	let stdout = "";
	child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
	return {
		child,
		output: () => stdout,
		exit: async () => {
			const [code] = child.exitCode === null ? await once(child, "exit") : [child.exitCode];
			return code;
		},
	};
}

it("lets one process at a time hold the lock", async ({ home }) => {
	const path = new URL("test.lock", home);
	const counter = new URL("counter", home);
	await writeFile(counter, "0");

	// Each process reads the counter, waits, then writes it plus one. Without
	// the lock, processes would overwrite each other's increments.
	const processes = Array.from({ length: 10 }, () =>
		lockProcess(
			path,
			`
			import { readFile, rename, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
			const counter = ${JSON.stringify(fileURLToPath(counter))};
			const lock = await acquireLock(path, { timeoutMs: 30_000 });
			const count = Number(await readFile(counter, "utf8"));
			await new Promise((resolve) => setTimeout(resolve, 50));
			if (await lock.isHeld()) await writeFile(counter, String(count + 1));
			await lock.release();
			`,
		),
	);
	expect(await Promise.all(processes.map((process) => process.exit()))).toEqual(Array(10).fill(0));
	expect(await readFile(counter, "utf8")).toBe("10");
});

it("takes over the lock of a process that exited", async ({ home }) => {
	const path = new URL("test.lock", home);
	const owner = lockProcess(path, `await acquireLock(path, { timeoutMs: 5_000 });`);
	expect(await owner.exit()).toBe(0);

	// The owner's PID is gone, so this doesn't wait for the lock to go stale.
	const started = Date.now();
	const lock = await acquireLock(path, { timeoutMs: 5_000, staleMs: 60_000 });
	expect(Date.now() - started).toBeLessThan(2_000);
	expect(await lock.isHeld()).toBe(true);
	await lock.release();
});

it.skipIf(process.platform === "win32")(
	"takes over the lock of a stalled process, which then drops its write",
	async ({ home }) => {
		const path = new URL("test.lock", home);
		const owner = lockProcess(
			path,
			`
			const lock = await acquireLock(path, { timeoutMs: 5_000, staleMs: 1_000, heartbeatMs: 200 });
			console.log("held");
			process.stdin.once("data", async () => {
				console.log((await lock.isHeld()) ? "still held" : "lost");
				process.exit();
			});
			`,
		);
		while (!owner.output().includes("held")) await once(owner.child.stdout, "data");

		// A stopped process is alive but stops touching the lock.
		owner.child.kill("SIGSTOP");
		const lock = await acquireLock(path, { timeoutMs: 10_000, staleMs: 1_000 });
		owner.child.kill("SIGCONT");

		owner.child.stdin.write("check\n");
		expect(await owner.exit()).toBe(0);
		expect(owner.output()).toContain("lost");
		expect(await lock.isHeld()).toBe(true);
		await lock.release();
	},
);

it("keeps the heartbeat after the lock briefly disappears", async ({ home }) => {
	const path = new URL("test.lock", home);
	const hidden = new URL("hidden.lock", home);
	const holder = await acquireLock(path, { timeoutMs: 1_000, staleMs: 500, heartbeatMs: 50 });

	// A recovering waiter renames the lock away, then puts it back.
	await rename(path, hidden);
	await sleep(150);
	await rename(hidden, path);

	await sleep(700);
	await expect(acquireLock(path, { timeoutMs: 200, staleMs: 500 })).rejects.toBeInstanceOf(
		LockTimeoutError,
	);
	expect(await holder.isHeld()).toBe(true);
	await holder.release();
});

it("waits for a live holder, then times out", async ({ home }) => {
	const path = new URL("test.lock", home);
	const holder = await acquireLock(path, { timeoutMs: 1_000 });

	await expect(acquireLock(path, { timeoutMs: 300 })).rejects.toBeInstanceOf(LockTimeoutError);

	await holder.release();
	expect(await holder.isHeld()).toBe(false);
	const next = await acquireLock(path, { timeoutMs: 300 });
	await next.release();
});
