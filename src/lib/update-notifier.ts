import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as z from "zod/mini";

import packageJson from "../../package.json" with { type: "json" };

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2000;

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
				spawnBackgroundCheck(options.npmPackageName, options.statePath);
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
function spawnBackgroundCheck(npmPackageName: string, statePath: URL): void {
	try {
		const payload = Buffer.from(
			JSON.stringify({
				npmPackageName,
				statePath: fileURLToPath(statePath),
				timeoutMs: FETCH_TIMEOUT_MS,
			}),
		).toString("base64");

		const child = spawn(
			process.execPath,
			["--input-type=module", "-e", BACKGROUND_CHECK_SCRIPT, payload],
			{ detached: true, stdio: "ignore" },
		);
		child.unref();
	} catch {
		// Silent failure — never breaks the CLI.
	}
}

const BACKGROUND_CHECK_SCRIPT = `
const {npmPackageName, statePath, timeoutMs} = JSON.parse(Buffer.from(process.argv[1], "base64").toString());
try {
	const url = \`https://registry.npmjs.org/\${npmPackageName}/latest\`;
	const res = await fetch(url, {signal: AbortSignal.timeout(timeoutMs)});
	if (!res.ok) process.exit(0);
	const {version} = await res.json();
	if (typeof version !== "string") process.exit(0);
	const fs = await import("node:fs/promises");
	let existing = {};
	try {
		const parsed = JSON.parse(await fs.readFile(statePath, "utf-8"));
		if (parsed && typeof parsed === "object") existing = parsed;
	} catch {}
	existing.latestKnownVersion = version;
	existing.lastUpdateCheckAt = Date.now();
	await fs.writeFile(statePath, JSON.stringify(existing, null, 2));
} catch {}
`;
