import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import * as z from "zod/mini";

import packageJson from "../../package.json" with { type: "json" };
import { readJsonFile, writeFileRecursive } from "./file";
import { stringify } from "./json";
import { getNpmPackageVersion } from "./packageJson";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const StateSchema = z.looseObject({
	latestKnownVersion: z.optional(z.string()),
	lastUpdateCheckAt: z.optional(z.number()),
});

export async function initUpdateNotifier(options: {
	npmPackageName: string;
	statePath: URL;
}): Promise<void> {
	const { npmPackageName, statePath } = options;
	try {
		const { NO_UPDATE_NOTIFIER, CI } = process.env;
		if (NO_UPDATE_NOTIFIER !== "0" && (NO_UPDATE_NOTIFIER === "1" || CI || !process.stderr.isTTY)) {
			return;
		}

		const state = await readJsonFile(statePath, { schema: StateSchema }).catch(() => undefined);
		const currentVersion = packageJson.version;

		if (state?.latestKnownVersion && isNewer(state.latestKnownVersion, currentVersion)) {
			const message = `Update available: ${currentVersion} → ${state.latestKnownVersion}. Run \`npx ${npmPackageName}@latest --version\` to update.`;
			process.on("exit", () => {
				try {
					console.error(`\n${message}`);
				} catch {}
			});
		}

		if (!state?.lastUpdateCheckAt || Date.now() - state.lastUpdateCheckAt > CHECK_INTERVAL_MS) {
			process.on("exit", () => {
				try {
					const script = fileURLToPath(
						new URL("./subprocesses/updateVersionState.mjs", import.meta.url),
					);
					spawn(process.execPath, [script, npmPackageName, statePath.href], {
						detached: true,
						stdio: "ignore",
					}).unref();
				} catch {}
			});
		}
	} catch {}
}

// Pre-release versions (e.g. "1.0.0-beta.1") are skipped. Comparing them
// correctly requires full semver logic, and missing an update is safer than
// showing a wrong one.
function isNewer(latest: string, current: string): boolean {
	const release = /^\d+\.\d+\.\d+$/;
	if (!release.test(latest) || !release.test(current)) return false;
	const a = latest.split(".").map(Number);
	const b = current.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] > b[i];
	}
	return false;
}

export async function updateVersionState(npmPackageName: string, statePath: URL): Promise<void> {
	const version = await getNpmPackageVersion(npmPackageName);
	await writeFileRecursive(
		statePath,
		stringify({ latestKnownVersion: version, lastUpdateCheckAt: Date.now() }),
	);
}
