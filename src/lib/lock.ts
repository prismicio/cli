import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const OWNER_FILENAME = "owner.json";

type Owner = { id: string; pid: number; hostname: string };

export type LockOptions = {
	timeoutMs: number;
	staleMs?: number;
	heartbeatMs?: number;
};

export type Lock = {
	isHeld(): Promise<boolean>;
	release(): Promise<void>;
};

export async function acquireLock(path: URL, options: LockOptions): Promise<Lock> {
	const { timeoutMs, staleMs = 10_000, heartbeatMs = 2_000 } = options;
	const owner: Owner = { id: randomUUID(), pid: process.pid, hostname: hostname() };
	const deadline = Date.now() + timeoutMs;

	let delayMs = 25;
	while (!(await tryCreate(path, owner))) {
		if (await recoverIfStale(path, staleMs)) continue;
		if (Date.now() >= deadline) {
			throw new LockTimeoutError(`Timed out waiting for the lock at ${fileURLToPath(path)}.`);
		}
		await sleep(delayMs * (0.5 + Math.random()));
		delayMs = Math.min(delayMs * 2, 500);
	}

	let released = false;
	const isHeld = async (): Promise<boolean> => {
		return !released && (await readOwner(path))?.id === owner.id;
	};

	// A waiter's rename can hide the lock for a moment, so a failed check only
	// skips one touch.
	const heartbeat = setInterval(async () => {
		if (!(await isHeld())) return;
		const now = new Date();
		await utimes(getOwnerPath(path), now, now).catch(() => {});
	}, heartbeatMs);
	heartbeat.unref();

	return {
		isHeld,
		async release() {
			clearInterval(heartbeat);
			const held = await isHeld();
			released = true;
			if (held) await rm(path, { recursive: true, force: true });
		},
	};
}

export class LockTimeoutError extends Error {
	name = "LockTimeoutError";
}

async function tryCreate(path: URL, owner: Owner): Promise<boolean> {
	try {
		await mkdir(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
		throw error;
	}
	try {
		// `wx` fails if another waiter put an older lock back in place.
		await writeFile(getOwnerPath(path), JSON.stringify(owner), { flag: "wx" });
		return true;
	} catch (error) {
		const { code } = error as NodeJS.ErrnoException;
		if (code === "EEXIST" || code === "ENOENT") return false;
		throw error;
	}
}

async function recoverIfStale(path: URL, staleMs: number): Promise<boolean> {
	const owner = await readOwner(path);
	const touched = await stat(getOwnerPath(path))
		.catch(() => stat(path))
		.catch(() => undefined);
	if (!touched) return true; // Released in the meantime.

	const isOld = Date.now() - touched.mtimeMs > staleMs;
	const isOrphan = owner?.hostname === hostname() && !isAlive(owner.pid);
	if (!isOld && !isOrphan) return false;

	// Only one waiter can rename a given lock away.
	const stalePath = new URL(`${path.href}.stale-${randomUUID()}`);
	try {
		await rename(path, stalePath);
	} catch {
		return false;
	}

	// Another waiter may have replaced the stale lock since the check.
	const moved = await readOwner(stalePath);
	if (moved && moved.id !== owner?.id) {
		try {
			await rename(stalePath, path);
			return false;
		} catch {}
	}
	await rm(stalePath, { recursive: true, force: true });
	return true;
}

async function readOwner(path: URL): Promise<Owner | undefined> {
	try {
		return JSON.parse(await readFile(getOwnerPath(path), "utf8"));
	} catch {
		return undefined;
	}
}

function getOwnerPath(path: URL): URL {
	return new URL(`${path.href}/${OWNER_FILENAME}`);
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM means the process exists but belongs to another user.
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}
