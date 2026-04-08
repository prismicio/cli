import packageJson from "../../package.json" with { type: "json" };

import { getNpmPackageVersion } from "./packageJson";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2000;

export type UpdateNotifierState = {
	latestKnownVersion?: string;
	lastUpdateCheckAt?: number;
};

export type UpdateNotifierOptions = {
	npmPackageName: string;
	getState: () => Promise<UpdateNotifierState | undefined>;
	updateState: (state: UpdateNotifierState) => Promise<void>;
};

export async function initUpdateNotifier(options: UpdateNotifierOptions): Promise<void> {
	try {
		if (shouldSkip()) return;

		const state = await options.getState();
		const currentVersion = packageJson.version;

		if (state?.latestKnownVersion && isNewer(state.latestKnownVersion, currentVersion)) {
			const message = `Update available: ${currentVersion} → ${state.latestKnownVersion}. Run \`npx ${options.npmPackageName}@latest\` to update.`;
			process.on("exit", () => {
				try {
					console.error(message);
				} catch {}
			});
		}

		const isStale =
			!state?.lastUpdateCheckAt || Date.now() - state.lastUpdateCheckAt > CHECK_INTERVAL_MS;
		if (isStale) {
			void backgroundCheck(options.npmPackageName, options.updateState);
		}
	} catch {
		// Never throw.
	}
}

function shouldSkip(): boolean {
	if (process.env.NO_UPDATE_NOTIFIER === "0") return false;
	if (process.env.NO_UPDATE_NOTIFIER === "1") return true;
	if (process.env.CI) return true;
	if (!process.stdout.isTTY) return true;
	return false;
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

async function backgroundCheck(
	name: string,
	updateState: (state: UpdateNotifierState) => Promise<void>,
): Promise<void> {
	try {
		const latest = await getNpmPackageVersion(name, "latest", {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!latest) return;
		await updateState({
			latestKnownVersion: latest,
			lastUpdateCheckAt: Date.now(),
		});
	} catch {
		// Never throw.
	}
}
