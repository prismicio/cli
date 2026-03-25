import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { getAdapter, type Adapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { env } from "../env";
import { generateAndWriteTypes } from "../lib/codegen";
import { createCommand, type CommandConfig } from "../lib/command";
import { segmentTrackEnd, segmentTrackStart } from "../lib/segment";
import { dedent } from "../lib/string";
import { findProjectRoot, getRepositoryName } from "../project";

// 5 seconds balances responsiveness with API load
const POLL_INTERVAL_MS = env.TEST ? 500 : 5000;
const MAX_BACKOFF_MS = 60000; // Cap backoff at 1 minute
const MAX_CONSECUTIVE_ERRORS = 10;

const config = {
	name: "prismic sync",
	description: `
		Sync slices, page types, and custom types from Prismic to local files.

		Remote models are the source of truth. Local files are created, updated,
		or deleted to match.
	`,
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
		watch: { type: "boolean", short: "w", description: "Watch for changes and sync continuously" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName(), watch } = values;

	const adapter = await getAdapter();

	console.info(`Syncing from repository: ${repo}`);

	segmentTrackStart("sync", { watch });

	if (watch) {
		await watchForChanges(repo, adapter);
	} else {
		await syncSlices(repo, adapter);
		await syncCustomTypes(repo, adapter);
		await regenerateTypes(adapter);
		segmentTrackEnd("sync", { watch });

		console.info("Sync complete");
	}
});

async function watchForChanges(repo: string, adapter: Adapter) {
	const token = await getToken();
	const host = await getHost();

	const initialRemoteSlices = await getSlices({ repo, token, host });
	const initialRemoteCustomTypes = await getCustomTypes({ repo, token, host });

	await syncSlices(repo, adapter);
	await syncCustomTypes(repo, adapter);
	await regenerateTypes(adapter);

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
					await syncSlices(repo, adapter);
					lastRemoteSlicesHash = remoteSlicesHash;
					changed.push("slices");
				}
				if (customTypesChanged) {
					await syncCustomTypes(repo, adapter);
					lastRemoteCustomTypesHash = remoteCustomTypesHash;
					changed.push("custom types");
				}

				await regenerateTypes(adapter);

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

export async function syncSlices(repo: string, adapter: Adapter): Promise<void> {
	const token = await getToken();
	const host = await getHost();

	const remoteSlices = await getSlices({ repo, token, host });
	const localSlices = await adapter.getSlices();

	// Handle slices update
	for (const remoteSlice of remoteSlices) {
		const localSlice = localSlices.find((slice) => slice.model.id === remoteSlice.id);
		if (localSlice) {
			await adapter.updateSlice(remoteSlice);
		}
	}

	// Handle slices deletion
	for (const localSlice of localSlices) {
		const existsRemotely = remoteSlices.some((slice) => slice.id === localSlice.model.id);
		if (!existsRemotely) {
			await adapter.deleteSlice(localSlice.model.id);
		}
	}

	// Handle slices creation
	const defaultLibrary = await adapter.getDefaultSliceLibrary();
	for (const remoteSlice of remoteSlices) {
		const existsLocally = localSlices.some((slice) => slice.model.id === remoteSlice.id);
		if (!existsLocally) {
			await adapter.createSlice(remoteSlice, defaultLibrary);
		}
	}
}

export async function syncCustomTypes(repo: string, adapter: Adapter): Promise<void> {
	const token = await getToken();
	const host = await getHost();

	const remoteCustomTypes = await getCustomTypes({ repo, token, host });
	const localCustomTypes = await adapter.getCustomTypes();

	// Handle custom types update
	for (const remoteCustomType of remoteCustomTypes) {
		const localCustomType = localCustomTypes.find(
			(customType) => customType.model.id === remoteCustomType.id,
		);
		if (localCustomType) {
			await adapter.updateCustomType(remoteCustomType);
		}
	}

	// Handle custom types deletion
	for (const localCustomType of localCustomTypes) {
		const existsRemotely = remoteCustomTypes.some(
			(customType) => customType.id === localCustomType.model.id,
		);
		if (!existsRemotely) {
			await adapter.deleteCustomType(localCustomType.model.id);
		}
	}

	// Handle custom types creation
	for (const remoteCustomType of remoteCustomTypes) {
		const existsLocally = localCustomTypes.some(
			(customType) => customType.model.id === remoteCustomType.id,
		);
		if (!existsLocally) {
			await adapter.createCustomType(remoteCustomType);
		}
	}
}

function shutdown(): void {
	console.info("Watch stopped. Goodbye!");
	segmentTrackEnd("sync", { watch: true });
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

async function regenerateTypes(adapter: Adapter): Promise<void> {
	const slices = await adapter.getSlices();
	const customTypes = await adapter.getCustomTypes();
	const projectRoot = await findProjectRoot();
	const output = new URL("prismicio-types.d.ts", projectRoot);
	await generateAndWriteTypes({
		customTypes: customTypes.map((customType) => customType.model),
		slices: slices.map((slice) => slice.model),
		output,
	});
}
