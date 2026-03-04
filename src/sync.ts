import { createHash } from "node:crypto";
import { parseArgs } from "node:util";

import type { PluginSystemRunner } from "@prismicio/plugin-kit";

import { isAuthenticated } from "./lib/auth";
import { readConfig, safeGetRepositoryFromConfig } from "./lib/config";
import {
	fetchRemoteCustomTypes,
	fetchRemoteSlices,
} from "./lib/custom-types-api";
import { findUpward } from "./lib/file";
import { initPluginSystem } from "./lib/plugin-system";
import { trackEnd } from "./lib/segment";

const HELP = `
Sync custom types and slices from Prismic to local files.

Remote models are the source of truth. Local files are created, updated,
or deleted to match.

USAGE
  prismic sync [flags]

FLAGS
  -r, --repo string   Repository domain
  -w, --watch         Watch for changes and sync continuously
  -h, --help          Show help for command
`.trim();

const POLL_INTERVAL_MS = 5000;
const MAX_BACKOFF_MS = 60000;
const MAX_CONSECUTIVE_ERRORS = 10;
const SHUTDOWN_TIMEOUT_MS = 3000;

type SyncResult = {
	typesCreated: number;
	typesUpdated: number;
	typesDeleted: number;
	slicesCreated: number;
	slicesUpdated: number;
	slicesDeleted: number;
};

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

	// Find project root
	const packageJsonPath = await findUpward("package.json");
	if (!packageJsonPath) {
		console.error("Could not find project root (no package.json found)");
		process.exitCode = 1;
		return;
	}
	const projectRoot = new URL(".", packageJsonPath);

	// Read config for adapter and libraries
	const configResult = await readConfig();
	const adapter = configResult.ok ? configResult.config.adapter : undefined;
	const libraries = configResult.ok ? configResult.config.libraries : undefined;

	// Initialize plugin system
	let runner: PluginSystemRunner;
	try {
		runner = await initPluginSystem({
			projectRoot,
			repositoryName: repo,
			adapter,
			libraries,
		});
	} catch (error) {
		console.error(
			`Failed to initialize plugin system: ${error instanceof Error ? error.message : error}`,
		);
		process.exitCode = 1;
		return;
	}

	// Determine libraryID for slice hooks
	const project = await runner.rawHelpers.getProject();
	const libraryID = project.config.libraries?.[0] ?? "./slices";

	console.info(`Syncing from repository: ${repo}`);

	if (watch) {
		await watchForChanges(repo, runner, libraryID);
	} else {
		const result = await syncModels(repo, runner, libraryID);
		if (!result) {
			return;
		}

		const total =
			result.typesCreated +
			result.typesUpdated +
			result.typesDeleted +
			result.slicesCreated +
			result.slicesUpdated +
			result.slicesDeleted;

		console.info(
			`\nSync complete: ${total} changes (${result.typesCreated + result.slicesCreated} created, ${result.typesUpdated + result.slicesUpdated} updated, ${result.typesDeleted + result.slicesDeleted} deleted)`,
		);
	}
}

async function syncModels(
	repo: string,
	runner: PluginSystemRunner,
	libraryID: string,
): Promise<SyncResult | undefined> {
	// Fetch remote models
	const [remoteTypesResult, remoteSlicesResult] = await Promise.all([
		fetchRemoteCustomTypes(repo),
		fetchRemoteSlices(repo),
	]);

	if (!remoteTypesResult.ok) {
		console.error(`Failed to fetch remote custom types: ${remoteTypesResult.error}`);
		process.exitCode = 1;
		return;
	}

	if (!remoteSlicesResult.ok) {
		console.error(`Failed to fetch remote slices: ${remoteSlicesResult.error}`);
		process.exitCode = 1;
		return;
	}

	// Read local models via plugin system
	const [localTypes, localSlices] = await Promise.all([
		runner.rawActions.readAllCustomTypeModels(),
		runner.rawActions.readAllSliceModels(),
	]);

	const remoteTypes = remoteTypesResult.value;
	const remoteSlices = remoteSlicesResult.value;

	const remoteTypesById = new Map(remoteTypes.map((t) => [t.id, t]));
	const localTypesById = new Map(localTypes.map((t) => [t.model.id, t]));
	const remoteSlicesById = new Map(remoteSlices.map((s) => [s.id, s]));
	const localSlicesById = new Map(localSlices.map((s) => [s.model.id, s]));

	let typesUpdated = 0;
	let typesDeleted = 0;
	let typesCreated = 0;

	// Update existing custom types
	for (const remoteType of remoteTypes) {
		if (localTypesById.has(remoteType.id)) {
			await runner.callHook("custom-type:update", {
				model: remoteType,
			});
			typesUpdated++;
		}
	}

	// Delete local custom types not in remote
	for (const localType of localTypes) {
		if (!remoteTypesById.has(localType.model.id)) {
			await runner.callHook("custom-type:delete", {
				model: localType.model,
			});
			typesDeleted++;
		}
	}

	// Create new custom types from remote
	for (const remoteType of remoteTypes) {
		if (!localTypesById.has(remoteType.id)) {
			await runner.callHook("custom-type:create", {
				model: remoteType,
			});
			typesCreated++;
		}
	}

	let slicesUpdated = 0;
	let slicesDeleted = 0;
	let slicesCreated = 0;

	// Update existing slices
	for (const remoteSlice of remoteSlices) {
		if (localSlicesById.has(remoteSlice.id)) {
			await runner.callHook("slice:update", {
				libraryID,
				model: remoteSlice,
			});
			slicesUpdated++;
		}
	}

	// Delete local slices not in remote
	for (const localSlice of localSlices) {
		if (!remoteSlicesById.has(localSlice.model.id)) {
			await runner.callHook("slice:delete", {
				libraryID: localSlice.libraryID,
				model: localSlice.model,
			});
			slicesDeleted++;
		}
	}

	// Create new slices from remote
	for (const remoteSlice of remoteSlices) {
		if (!localSlicesById.has(remoteSlice.id)) {
			await runner.callHook("slice:create", {
				libraryID,
				model: remoteSlice,
			});
			slicesCreated++;
		}
	}

	return { typesCreated, typesUpdated, typesDeleted, slicesCreated, slicesUpdated, slicesDeleted };
}

async function watchForChanges(
	repo: string,
	runner: PluginSystemRunner,
	libraryID: string,
): Promise<void> {
	// Initial sync
	const result = await syncModels(repo, runner, libraryID);
	if (!result) {
		return;
	}

	// Capture initial hashes
	const [initialTypes, initialSlices] = await Promise.all([
		fetchRemoteCustomTypes(repo),
		fetchRemoteSlices(repo),
	]);

	let lastTypesHash = initialTypes.ok ? computeHash(initialTypes.value) : "";
	let lastSlicesHash = initialSlices.ok ? computeHash(initialSlices.value) : "";

	console.info("\nInitial sync completed! Now watching for changes...");
	console.info(`Watching for changes (polling every ${POLL_INTERVAL_MS / 1000}s)...`);
	console.info("Press Ctrl+C to stop\n");

	// Graceful shutdown — best-effort telemetry flush before exit
	const shutdown = async (): Promise<void> => {
		console.info("\nWatch stopped. Goodbye!");

		await Promise.race([
			trackEnd("sync", true),
			new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
		]);

		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
	process.on("SIGHUP", shutdown);
	process.on("SIGQUIT", shutdown);
	if (process.platform === "win32") {
		process.on("SIGBREAK", shutdown);
	}

	let consecutiveErrors = 0;

	while (true) {
		// Sleep with exponential backoff on errors
		const delay =
			consecutiveErrors === 0
				? POLL_INTERVAL_MS
				: Math.min(POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors - 1), MAX_BACKOFF_MS);
		await new Promise<void>((resolve) => setTimeout(resolve, delay));

		try {
			const [remoteTypes, remoteSlices] = await Promise.all([
				fetchRemoteCustomTypes(repo),
				fetchRemoteSlices(repo),
			]);

			if (!remoteTypes.ok) {
				throw new Error(`Custom types: ${remoteTypes.error}`);
			}

			if (!remoteSlices.ok) {
				throw new Error(`Slices: ${remoteSlices.error}`);
			}

			const typesHash = computeHash(remoteTypes.value);
			const slicesHash = computeHash(remoteSlices.value);

			const typesChanged = typesHash !== lastTypesHash;
			const slicesChanged = slicesHash !== lastSlicesHash;

			if (typesChanged || slicesChanged) {
				const timestamp = new Date().toLocaleTimeString();
				const changes = [typesChanged && "custom types", slicesChanged && "slices"]
					.filter(Boolean)
					.join(" and ");

				console.info(`[${timestamp}] Changes detected in ${changes}`);

				await syncModels(repo, runner, libraryID);

				lastTypesHash = typesHash;
				lastSlicesHash = slicesHash;

				console.info("Changes synced successfully\n");
			}

			consecutiveErrors = 0;
		} catch (error) {
			consecutiveErrors++;

			const message = error instanceof Error ? error.message : "Unknown error";
			const nextDelay = Math.min(
				POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors - 1),
				MAX_BACKOFF_MS,
			);

			console.warn(`Error checking for changes: ${message}. Retrying in ${nextDelay / 1000}s...`);

			if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
				throw new Error(
					`Too many consecutive errors (${MAX_CONSECUTIVE_ERRORS}), stopping watch.`,
				);
			}
		}
	}
}

function computeHash(data: unknown): string {
	return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
