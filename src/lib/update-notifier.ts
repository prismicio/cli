import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as z from "zod/mini";

import packageJson from "../../package.json" with { type: "json" };

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const UpdateNotifierStateSchema = z.looseObject({
	latestKnownVersion: z.optional(z.string()),
	lastUpdateCheckAt: z.optional(z.number()),
});
type UpdateNotifierState = z.infer<typeof UpdateNotifierStateSchema>;

export type UpdateNotifierOptions = {
	npmPackageName: string;
	statePath: URL;
};

export async function initUpdateNotifier(options: UpdateNotifierOptions): Promise<void> {
	try {
		if (shouldSkip()) return;

		const state = await readState(options.statePath);
		const currentVersion = packageJson.version;

		if (state?.latestKnownVersion && isNewer(state.latestKnownVersion, currentVersion)) {
			const message = `Update available: ${currentVersion} → ${state.latestKnownVersion}. Run \`npx ${options.npmPackageName}@latest --version\` to update.`;
			process.on("exit", () => {
				try {
					console.error(`\n${message}`);
				} catch {}
			});
		}

		const isStale =
			!state?.lastUpdateCheckAt || Date.now() - state.lastUpdateCheckAt > CHECK_INTERVAL_MS;
		if (isStale) {
			process.on("exit", () => {
				spawnBackgroundCheck();
			});
		}
	} catch {
		// Never throw.
	}
}

function shouldSkip(): boolean {
	if (process.env.NO_UPDATE_NOTIFIER === "0") return false;
	if (process.env.NO_UPDATE_NOTIFIER === "1") return true;
	if (process.env.CI) return true;
	if (!process.stderr.isTTY) return true;
	return false;
}

async function readState(statePath: URL): Promise<UpdateNotifierState | undefined> {
	try {
		const contents = await readFile(statePath, "utf-8");
		const json = JSON.parse(contents);
		return z.parse(UpdateNotifierStateSchema, json);
	} catch {
		return undefined;
	}
}

function isNewer(latest: string, current: string): boolean {
	// Skip pre-release versions (e.g. "1.0.0-beta.1"). Comparing them
	// correctly requires full semver logic, and missing an update is safer
	// than showing a wrong one.
	if (latest.includes("-") || current.includes("-")) return false;
	const a = latest.split(".").map(Number);
	const b = current.split(".").map(Number);
	if (a.length !== 3 || b.length !== 3) return false;
	if (a.some((n) => !Number.isFinite(n)) || b.some((n) => !Number.isFinite(n))) return false;
	for (let i = 0; i < 3; i++) {
		if (a[i] > b[i]) return true;
		if (a[i] < b[i]) return false;
	}
	return false;
}

/**
 * Spawns a detached subprocess to fetch the latest version from the npm
 * registry and persist it to the state file. The main process exits
 * immediately; the subprocess handles HTTP delivery and the file write.
 */
function spawnBackgroundCheck(): void {
	try {
		const script = fileURLToPath(
			new URL("./subprocesses/update-check.mjs", import.meta.url),
		);
		const child = spawn(process.execPath, [script], { detached: true, stdio: "ignore" });
		child.unref();
	} catch {
		// Silent failure — never breaks the CLI.
	}
}
