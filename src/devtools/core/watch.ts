import type { PrismicManager } from "@prismicio/manager";
import chalk from "chalk";
import crypto from "crypto";

import { displaySuccess } from "../utils/output";

import { saveCustomTypes } from "./customType";
import { saveSlices } from "./slices";

// 5 seconds balances responsiveness with API load
const POLL_INTERVAL_MS = 5000;
const MAX_BACKOFF_MS = 60000; // Cap backoff at 1 minute
const MAX_CONSECUTIVE_ERRORS = 10;
const SHUTDOWN_TIMEOUT_MS = 3000; // Max time to wait for telemetry on shutdown

type WatchForChangesArgs = {
	manager: PrismicManager;
	repositoryName: string;
};

export async function watchForChanges(
	args: WatchForChangesArgs,
): Promise<void> {
	const { manager, repositoryName } = args;

	// Perform initial sync and capture hashes
	const initialSlices = await manager.slices.fetchRemoteSlices();
	const initialCustomTypes = await manager.customTypes.fetchRemoteCustomTypes();

	await saveSlices({ manager });
	await saveCustomTypes({ manager });

	let lastSlicesHash = computeHash(initialSlices);
	let lastCustomTypesHash = computeHash(initialCustomTypes);

	displaySuccess("Initial sync completed!", "Now watching for changes...");
	displayWatching({ intervalMs: POLL_INTERVAL_MS });

	// Graceful shutdown handling
	const shutdown = async () => {
		displayStandout("Watch stopped. Goodbye!");

		// Best-effort telemetry with timeout (don't hang forever if telemetry fails)
		await Promise.race([
			manager.telemetry.track({
				event: "prismic-cli:end",
				commandType: "sync",
				repository: repositoryName,
				fullCommand: process.argv.join(" "),
				success: true,
				watch: true,
			}),
			new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
		]);

		process.exit(0);
	};

	// Handle all common termination signals
	process.on("SIGINT", shutdown); // Ctrl+C
	process.on("SIGTERM", shutdown); // kill command
	process.on("SIGHUP", shutdown); // terminal closed
	process.on("SIGQUIT", shutdown); // Ctrl+\
	if (process.platform === "win32") {
		process.on("SIGBREAK", shutdown); // Windows Ctrl+Break
	}

	let consecutiveErrors = 0;

	// Watch loop - runs indefinitely until terminated by signal (Ctrl+C, etc.)
	while (true) {
		await sleep(consecutiveErrors);

		try {
			const remoteSlices = await manager.slices.fetchRemoteSlices();
			const remoteCustomTypes =
				await manager.customTypes.fetchRemoteCustomTypes();

			const slicesHash = computeHash(remoteSlices);
			const customTypesHash = computeHash(remoteCustomTypes);

			const slicesChanged = slicesHash !== lastSlicesHash;
			const customTypesChanged = customTypesHash !== lastCustomTypesHash;

			if (slicesChanged || customTypesChanged) {
				displayChange({
					slices: slicesChanged,
					customTypes: customTypesChanged,
				});

				if (slicesChanged) {
					await saveSlices({ manager });
					lastSlicesHash = slicesHash;
				}

				if (customTypesChanged) {
					await saveCustomTypes({ manager });
					lastCustomTypesHash = customTypesHash;
				}

				displaySyncComplete();
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

			displayRetryWarning(
				`Error checking for changes: ${message}. Retrying in ${nextDelay / 1000}s...`,
			);

			if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
				throw new Error(
					`Too many consecutive errors (${MAX_CONSECUTIVE_ERRORS}), stopping watch.`,
				);
			}
		}
	}
}

function computeHash(data: unknown): string {
	return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

// Exponential backoff: 5s, 10s, 20s, 40s, 60s (capped)
function sleep(errorCount: number): Promise<void> {
	const delay =
		errorCount === 0
			? POLL_INTERVAL_MS
			: Math.min(
					POLL_INTERVAL_MS * Math.pow(2, errorCount - 1),
					MAX_BACKOFF_MS,
				);

	return new Promise((resolve) => setTimeout(resolve, delay));
}

function displayWatching({ intervalMs }: { intervalMs: number }): void {
	const seconds = intervalMs / 1000;
	console.info(
		chalk.cyan(`\n  Watching for changes (polling every ${seconds}s)...`),
	);
	console.info(chalk.gray("  Press Ctrl+C to stop\n"));
}

function displayChange({
	slices,
	customTypes,
}: {
	slices: boolean;
	customTypes: boolean;
}): void {
	const timestamp = new Date().toLocaleTimeString();
	const changes = [slices && "slices", customTypes && "custom types"]
		.filter(Boolean)
		.join(" and ");

	console.info(chalk.blue(`\n  [${timestamp}] Changes detected in ${changes}`));
}

function displaySyncComplete(): void {
	console.info(chalk.green("  ✓ Changes synced successfully\n"));
}

// Message with padding to visually stand out from the continuous watch output
function displayStandout(message: string): void {
	console.info(chalk.blue(`\n  ${message}\n`));
}

// Inline warning without extra padding to keep retry messages compact
function displayRetryWarning(message: string): void {
	console.warn(chalk.yellow(`  ⚠ ${message}`));
}
