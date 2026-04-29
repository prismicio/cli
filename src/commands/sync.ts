import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { getAdapter, type Adapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { env } from "../env";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { segmentTrackEnd, segmentTrackStart } from "../lib/segment";
import { dedent, formatTable } from "../lib/string";
import { appendTrailingSlash, relativePathname } from "../lib/url";
import {
	checkIsTypeBuilderEnabled,
	findProjectRoot,
	getRepositoryName,
	TypeBuilderRequiredError,
	writeSnapshot,
} from "../project";

// 5 seconds balances responsiveness with API load
const POLL_INTERVAL_MS = env.TEST ? 500 : 5000;
const MAX_BACKOFF_MS = 60000; // Cap backoff at 1 minute
const MAX_CONSECUTIVE_ERRORS = 10;

const config = {
	name: "prismic sync",
	description: `
		Sync content types and slices from Prismic to local files.

		Remote models are the source of truth. Local files are created, updated,
		or deleted to match.
	`,
	options: {
		force: { type: "boolean", short: "f", description: "Allow destructive changes" },
		repo: { type: "string", short: "r", description: "Repository domain" },
		watch: { type: "boolean", short: "w", description: "Watch for changes and sync continuously" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { force = false, repo = await getRepositoryName(), watch } = values;

	const token = await getToken();
	const host = await getHost();
	const isTypeBuilderEnabled = await checkIsTypeBuilderEnabled(repo, { token, host });
	if (!isTypeBuilderEnabled) {
		throw new TypeBuilderRequiredError();
	}

	const adapter = await getAdapter();

	console.info(`Syncing from repository: ${repo}`);

	segmentTrackStart("sync", { watch });

	if (watch) {
		await watchForChanges(repo, adapter);
	} else {
		if (!force) {
			const [localCustomTypes, localSlices, remoteCustomTypes, remoteSlices] = await Promise.all([
				adapter.getCustomTypes(),
				adapter.getSlices(),
				getCustomTypes({ repo, token, host }),
				getSlices({ repo, token, host }),
			]);
			const projectRoot = await findProjectRoot();

			const destructiveRows: string[][] = [];
			for (const local of localSlices) {
				const remote = remoteSlices.find((r) => r.id === local.model.id);
				const file = relativePathname(
					projectRoot,
					new URL("model.json", appendTrailingSlash(local.directory)),
				);
				if (!remote) destructiveRows.push(["Delete slice", local.model.id, file]);
				else if (modelsDiffer(local.model, remote))
					destructiveRows.push(["Overwrite slice", local.model.id, file]);
			}
			for (const local of localCustomTypes) {
				const remote = remoteCustomTypes.find((r) => r.id === local.model.id);
				const file = relativePathname(
					projectRoot,
					new URL("index.json", appendTrailingSlash(local.directory)),
				);
				if (!remote) destructiveRows.push(["Delete type", local.model.id, file]);
				else if (modelsDiffer(local.model, remote))
					destructiveRows.push(["Overwrite type", local.model.id, file]);
			}

			if (destructiveRows.length > 0) {
				throw new CommandError(dedent`
					The following destructive changes will happen:

					  ${formatTable(destructiveRows, { headers: ["OPERATION", "ID", "FILE"] })}

					Re-run the command with \`--force\` to confirm.
				`);
			}
		}

		await adapter.syncModels({ repo, token, host });

		const [snapshotCustomTypes, snapshotSlices] = await Promise.all([
			getCustomTypes({ repo, token, host }),
			getSlices({ repo, token, host }),
		]);
		await writeSnapshot(repo, { customTypes: snapshotCustomTypes, slices: snapshotSlices });

		segmentTrackEnd("sync", { watch });

		console.info("Sync complete");
	}
});

function modelsDiffer<T extends CustomType | SharedSlice>(a: T, b: T): boolean {
	return JSON.stringify(a) !== JSON.stringify(b);
}

async function watchForChanges(repo: string, adapter: Adapter) {
	const token = await getToken();
	const host = await getHost();

	const initialRemoteSlices = await getSlices({ repo, token, host });
	const initialRemoteCustomTypes = await getCustomTypes({ repo, token, host });

	await adapter.syncModels({ repo, token, host });

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
					await adapter.syncSlices({ repo, token, host, generateTypes: false });
					lastRemoteSlicesHash = remoteSlicesHash;
					changed.push("slices");
				}
				if (customTypesChanged) {
					await adapter.syncCustomTypes({ repo, token, host, generateTypes: false });
					lastRemoteCustomTypesHash = remoteCustomTypesHash;
					changed.push("custom types");
				}

				await adapter.generateTypes();

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
