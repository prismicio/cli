import packageJson from "../../package.json" with { type: "json" };

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2000;
const NPM_REGISTRY = "https://registry.npmjs.org";

export type UpdateNotifierState = {
	latestKnownVersion?: string;
	lastUpdateCheckAt?: number;
};

export type UpdateNotifierOptions = {
	npmPackageName: string;
	getState: () => Promise<UpdateNotifierState | undefined>;
	onUpdateState: (state: UpdateNotifierState) => Promise<void>;
};

export async function initUpdateNotifier(options: UpdateNotifierOptions): Promise<void> {
	try {
		if (shouldSkip()) return;

		const state = await options.getState();
		const currentVersion = packageJson.version;

		if (state?.latestKnownVersion && isNewer(state.latestKnownVersion, currentVersion)) {
			const message = formatMessage(currentVersion, state.latestKnownVersion, options.npmPackageName);
			process.on("exit", () => {
				try {
					console.error(message);
				} catch {}
			});
		}

		const isStale =
			!state?.lastUpdateCheckAt || Date.now() - state.lastUpdateCheckAt > CHECK_INTERVAL_MS;
		if (isStale) {
			void backgroundCheck(options.npmPackageName, options.onUpdateState);
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

function formatMessage(current: string, latest: string, npmPackageName: string): string {
	return `Update available: ${current} → ${latest}. Run \`npx ${npmPackageName}@latest\` to update.`;
}

async function fetchLatestVersion(name: string): Promise<string | undefined> {
	try {
		const url = new URL(`${name}/latest`, `${NPM_REGISTRY}/`);
		const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (!res.ok) return undefined;
		const json = await res.json();
		const version = (json as { version?: unknown }).version;
		return typeof version === "string" ? version : undefined;
	} catch {
		return undefined;
	}
}

async function backgroundCheck(
	name: string,
	onUpdateState: (state: UpdateNotifierState) => Promise<void>,
): Promise<void> {
	try {
		const latest = await fetchLatestVersion(name);
		if (!latest) return;
		await onUpdateState({
			latestKnownVersion: latest,
			lastUpdateCheckAt: Date.now(),
		});
	} catch {
		// Never throw.
	}
}
