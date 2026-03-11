import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { parseArgs } from "node:util";

import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { safeGetRepositoryFromConfig } from "../config";
import { type FrameworkAdapter, NoSupportedFrameworkError, requireFramework } from "../frameworks";
import { segmentSetRepository, segmentTrackEnd, segmentTrackStart } from "../lib/segment";
import { sentrySetContext, sentrySetTag } from "../lib/sentry";
import { dedent } from "../lib/string";

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

	// Override analytics repository context with the resolved repo
	segmentSetRepository(repo);
	sentrySetTag("repository", repo);
	sentrySetContext("Repository Data", { name: repo });

	let framework: FrameworkAdapter;
	try {
		framework = await requireFramework();
	} catch (error) {
		if (error instanceof NoSupportedFrameworkError) {
			console.error(error.message);
			process.exitCode = 1;
			return;
		}
		throw error;
	}

	console.info(`Syncing from repository: ${repo}`);

	segmentTrackStart("sync", { repository: repo });

	if (watch) {
		await watchForChanges(repo, framework);
	} else {
		await syncSlices(repo, framework);
		await syncCustomTypes(repo, framework);
		segmentTrackEnd("sync", true, undefined, { watch: false });

		console.info("Sync complete");
	}
}

async function watchForChanges(repo: string, framework: FrameworkAdapter) {
	const token = await getToken();
	const host = await getHost();

	const initialRemoteSlices = await getSlices({ repo, token, host });
	const initialRemoteCustomTypes = await getCustomTypes({ repo, token, host });

	await syncSlices(repo, framework);
	await syncCustomTypes(repo, framework);

	console.info(dedent`
		Initial sync completed!

		Watching for changes (polling every ${POLL_INTERVAL_MS / 1000}s),
		Press Ctrl+C to stop\n
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
			const remoteSlicesResult = await getSlices({ repo, token, host });
			const remoteSlicesHash = hash(remoteSlicesResult);
			const slicesChanged = remoteSlicesHash !== lastRemoteSlicesHash;

			const remoteCustomTypesResult = await getCustomTypes({ repo, token, host });
			const remoteCustomTypesHash = hash(remoteCustomTypesResult);
			const customTypesChanged = remoteCustomTypesHash !== lastRemoteCustomTypesHash;

			if (slicesChanged || customTypesChanged) {
				const changed = [];

				if (slicesChanged) {
					await syncSlices(repo, framework);
					lastRemoteSlicesHash = remoteSlicesHash;
					changed.push("slices");
				}
				if (customTypesChanged) {
					await syncCustomTypes(repo, framework);
					lastRemoteCustomTypesHash = remoteCustomTypesHash;
					changed.push("custom types");
				}

				const timestamp = new Date().toLocaleTimeString();
				console.info(`[${timestamp}] Changes detected in ${changed.join(" and ")}`);
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
	const token = await getToken();
	const host = await getHost();

	const remoteSlices = await getSlices({ repo, token, host });
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
	const token = await getToken();
	const host = await getHost();

	const remoteCustomTypes = await getCustomTypes({ repo, token, host });
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
			if (localCustomType.model.format === "page") {
				await framework.removeRoutesForPageType(localCustomType.model.id);
			}
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

	// Append missing page type routes to prismicio.ts
	await framework.updateRoutesForPageTypes(remoteCustomTypes);
}

function shutdown(): void {
	console.info("Watch stopped. Goodbye!");
	segmentTrackEnd("sync", true, undefined, { watch: true });
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
