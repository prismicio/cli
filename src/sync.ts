import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { parseArgs } from "node:util";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { fetchRemoteCustomTypes, fetchRemoteSlices } from "./lib/custom-types-api";
import { type FrameworkAdapter, getFramework } from "./framework";
import { trackEnd } from "./lib/segment";
import { dedent } from "./lib/string";

const HELP = `
Sync slices, page types, and custom types from Prismic to local files.

Remote models are the source of truth. Local files are created, updated,
or deleted to match.

USAGE
  prismic sync [flags]

FLAGS
  -r, --repo string   Repository domain
  -w, --watch         Watch for changes and sync continuously
  -h, --help          Show help for command
`.trim();

// 5 seconds balances responsiveness with API load
const POLL_INTERVAL_MS = 5000;
const MAX_BACKOFF_MS = 60000; // Cap backoff at 1 minute
const MAX_CONSECUTIVE_ERRORS = 10;

export async function sync(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig(), watch },
	} = parseArgs({
		args: process.argv.slice(3), // skip: node, script, "sync"
		options: {
			repo: { type: "string", short: "r" },
			watch: { type: "boolean", short: "w" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: false,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!repo) {
		console.error("Missing prismic.config.json or --repo option");
		process.exitCode = 1;
		return;
	}

	if (!(await isAuthenticated())) {
		console.error("Not logged in. Run `prismic login` first.");
		process.exitCode = 1;
		return;
	}

	const framework = await getFramework();
	if (!framework) {
		console.error("Could not detect a supported framework (Next.js, Nuxt, or SvelteKit).");
		process.exitCode = 1;
		return;
	}

	console.info(`Syncing from repository: ${repo}`);

	if (watch) {
		await watchForChanges(repo, framework);
	} else {
		await syncSlices(repo, framework);
		await syncCustomTypes(repo, framework);

		console.info("Sync complete");
	}
}

async function watchForChanges(repo: string, framework: FrameworkAdapter) {
	const remoteSlicesResult = await fetchRemoteSlices(repo);
	if (!remoteSlicesResult.ok) {
		console.error(`Failed to fetch remote slices: ${remoteSlicesResult.error}`);
		process.exitCode = 1;
		return;
	}
	const initialRemoteSlices = remoteSlicesResult.value;

	const remoteCustomTypesResult = await fetchRemoteCustomTypes(repo);
	if (!remoteCustomTypesResult.ok) {
		console.error(`Failed to fetch remote custom types: ${remoteCustomTypesResult.error}`);
		process.exitCode = 1;
		return;
	}
	const initialRemoteCustomTypes = remoteCustomTypesResult.value;

	await syncSlices(repo, framework);
	await syncCustomTypes(repo, framework);

	console.info(dedent`
		Initial sync completed!

		Watching for changes (polling every ${POLL_INTERVAL_MS / 1000}s),
		Press Ctrl+C to stop
	`);

	let lastRemoteSlicesHash = hash(initialRemoteSlices);
	let lastRemoteCustomTypesHash = hash(initialRemoteCustomTypes);

	let consecutiveErrors = 0;

	// Handle all common termination signals
	process.on("SIGINT", shutdown); // Ctrl+C
	process.on("SIGTERM", shutdown); // kill command
	process.on("SIGHUP", shutdown); // terminal closed
	process.on("SIGQUIT", shutdown); // Ctrl+\
	if (process.platform === "win32") {
		process.on("SIGBREAK", shutdown); // Windows Ctrl+Break
	}

	while (true) {
		await setTimeout(exponentialMs(consecutiveErrors));

		try {
			const remoteSlicesResult = await fetchRemoteSlices(repo);
			if (!remoteSlicesResult.ok) continue;
			const remoteSlicesHash = hash(remoteSlicesResult.value);
			const slicesChanged = remoteSlicesHash !== lastRemoteSlicesHash;

			const remoteCustomTypesResult = await fetchRemoteCustomTypes(repo);
			if (!remoteCustomTypesResult.ok) continue;
			const remoteCustomTypesHash = hash(remoteCustomTypesResult.value);
			const customTypesChanged = remoteCustomTypesHash !== lastRemoteCustomTypesHash;

			if (slicesChanged || customTypesChanged) {
				if (slicesChanged) {
					await syncSlices(repo, framework);
					lastRemoteSlicesHash = remoteSlicesHash;
				}
				if (customTypesChanged) {
					await syncCustomTypes(repo, framework);
					lastRemoteCustomTypesHash = remoteCustomTypesHash;
				}
			}

			// Reset error count on success
			consecutiveErrors = 0;
		} catch (error) {
			consecutiveErrors++;

			const message = error instanceof Error ? error.message : "Unknown error";

			const nextDelay = Math.min(
				POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors - 1),
				MAX_BACKOFF_MS,
			);

			console.error(`Error checking for changes: ${message}. Retrying in ${nextDelay / 1000}s...`);

			if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
				throw new Error(`Too many consecutive errors (${MAX_CONSECUTIVE_ERRORS}), stopping watch.`);
			}
		}
	}
}

export async function syncSlices(repo: string, framework: FrameworkAdapter): Promise<void> {
	const remoteSlicesResult = await fetchRemoteSlices(repo);
	if (!remoteSlicesResult.ok) {
		console.error(`Failed to fetch remote slices: ${remoteSlicesResult.error}`);
		process.exitCode = 1;
		return;
	}
	const remoteSlices = remoteSlicesResult.value;
	const localSlices = await framework.getSlices();

	// Handle slices update
	for (const remoteSlice of remoteSlices) {
		const localSlice = localSlices.find((slice) => slice.model.id === remoteSlice.id);
		if (localSlice) {
			await framework.updateSlice(remoteSlice);
		}
	}

	// Handle slices deletion
	for (const localSlice of localSlices) {
		const existsRemotely = remoteSlices.some((slice) => slice.id === localSlice.model.id);
		if (!existsRemotely) {
			await framework.deleteSlice(localSlice.model.id);
		}
	}

	// Handle slices creation
	const defaultLibrary = await framework.getDefaultSliceLibrary();
	for (const remoteSlice of remoteSlices) {
		const existsLocally = localSlices.some((slice) => slice.model.id === remoteSlice.id);
		if (!existsLocally) {
			await framework.createSlice(remoteSlice, defaultLibrary);
		}
	}
}

export async function syncCustomTypes(repo: string, framework: FrameworkAdapter): Promise<void> {
	const remoteCustomTypesResult = await fetchRemoteCustomTypes(repo);
	if (!remoteCustomTypesResult.ok) {
		console.error(`Failed to fetch remote custom types: ${remoteCustomTypesResult.error}`);
		process.exitCode = 1;
		return;
	}
	const remoteCustomTypes = remoteCustomTypesResult.value;
	const localCustomTypes = await framework.getCustomTypes();

	// Handle custom types update
	for (const remoteCustomType of remoteCustomTypes) {
		const localCustomType = localCustomTypes.find(
			(customType) => customType.model.id === remoteCustomType.id,
		);
		if (localCustomType) {
			await framework.updateCustomType(remoteCustomType);
		}
	}

	// Handle custom types deletion
	for (const localCustomType of localCustomTypes) {
		const existsRemotely = remoteCustomTypes.some(
			(customType) => customType.id === localCustomType.model.id,
		);
		if (!existsRemotely) {
			await framework.deleteCustomType(localCustomType.model.id);
		}
	}

	// Handle custom types creation
	for (const remoteCustomType of remoteCustomTypes) {
		const existsLocally = localCustomTypes.some(
			(customType) => customType.model.id === remoteCustomType.id,
		);
		if (!existsLocally) {
			await framework.createCustomType(remoteCustomType);
		}
	}
}

function shutdown(): void {
	console.info("Watch stopped. Goodbye!");
	trackEnd("sync", true);
	process.exit(0);
}

// Exponential backoff: 5s, 10s, 20s, 40s, 60s (capped)
function exponentialMs(base: number): number {
	if (base === 0) return POLL_INTERVAL_MS;
	return Math.min(POLL_INTERVAL_MS * Math.pow(2, base - 1), MAX_BACKOFF_MS);
}

function hash(data: unknown): string {
	return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
