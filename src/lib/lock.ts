import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// A lock shared by processes on one machine: a directory created with `mkdir`,
// which is atomic. The holder writes its owner ID, PID and hostname inside and
// touches it on a heartbeat. A lock nobody touched recently, or whose owner
// process is gone, is stale, and a waiter takes it over.

export type LockOptions = {
	/** How long to wait for the current holder. */
	timeoutMs: number;
	/** A lock nobody touched for this long is stale. */
	staleMs?: number;
	/** How often the holder touches the lock. */
	heartbeatMs?: number;
};

export type Lock = {
	/** Whether this process still holds the lock. Check it before each write. */
	isHeld(): Promise<boolean>;
	release(): Promise<void>;
};

export class LockTimeoutError extends Error {
	name = "LockTimeoutError";
}

type Owner = { id: string; pid: number; hostname: string };

const OWNER_FILE = "owner.json";

export async function acquireLock(path: URL, options: LockOptions): Promise<Lock> {
	const { timeoutMs, staleMs = 10_000, heartbeatMs = 2_000 } = options;
	const dir = fileURLToPath(path);
	const owner: Owner = { id: randomUUID(), pid: process.pid, hostname: hostname() };
	const deadline = Date.now() + timeoutMs;

	let delayMs = 25;
	while (!(await tryCreate(dir, owner))) {
		if (await recoverIfStale(dir, staleMs)) continue;
		if (Date.now() >= deadline) {
			throw new LockTimeoutError(`Timed out waiting for the lock at ${dir}.`);
		}
		await sleep(delayMs * (0.5 + Math.random()));
		delayMs = Math.min(delayMs * 2, 500);
	}

	let released = false;
	const isHeld = async (): Promise<boolean> => {
		return !released && (await readOwner(dir))?.id === owner.id;
	};

	// A failed check skips one touch but never stops the heartbeat: a waiter's
	// rename can hide the lock for a moment before putting it back.
	const heartbeat = setInterval(async () => {
		if (!(await isHeld())) return;
		const now = new Date();
		await utimes(join(dir, OWNER_FILE), now, now).catch(() => {});
	}, heartbeatMs);
	heartbeat.unref();

	return {
		isHeld,
		async release() {
			clearInterval(heartbeat);
			const held = await isHeld();
			released = true;
			if (held) await rm(dir, { recursive: true, force: true });
		},
	};
}

async function tryCreate(dir: string, owner: Owner): Promise<boolean> {
	try {
		await mkdir(dir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
		throw error;
	}
	try {
		// `wx` fails if another waiter put an older lock back in place.
		await writeFile(join(dir, OWNER_FILE), JSON.stringify(owner), { flag: "wx" });
		return true;
	} catch (error) {
		const { code } = error as NodeJS.ErrnoException;
		if (code === "EEXIST" || code === "ENOENT") return false;
		throw error;
	}
}

async function recoverIfStale(dir: string, staleMs: number): Promise<boolean> {
	const owner = await readOwner(dir);
	const touched = await stat(join(dir, OWNER_FILE))
		.catch(() => stat(dir))
		.catch(() => undefined);
	if (!touched) return true; // Released in the meantime.

	const isOld = Date.now() - touched.mtimeMs > staleMs;
	const isOrphan = owner?.hostname === hostname() && !isAlive(owner.pid);
	if (!isOld && !isOrphan) return false;

	// Renaming first means only one waiter takes over a given lock.
	const trash = `${dir}.stale-${randomUUID()}`;
	try {
		await rename(dir, trash);
	} catch {
		return false;
	}

	// Another waiter may have replaced the stale lock between the check and
	// the rename. Put that newer lock back.
	const moved = await readOwner(trash);
	if (moved && moved.id !== owner?.id) {
		try {
			await rename(trash, dir);
			return false;
		} catch {
			// A third process created a lock in the meantime. The newer lock's
			// owner sees it lost the lock at its next check.
		}
	}
	await rm(trash, { recursive: true, force: true });
	return true;
}

async function readOwner(dir: string): Promise<Owner | undefined> {
	try {
		return JSON.parse(await readFile(join(dir, OWNER_FILE), "utf8"));
	} catch {
		return undefined;
	}
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM: the process exists but belongs to another user.
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}
