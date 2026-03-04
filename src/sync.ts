import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { trackEnd } from "./lib/segment";
import {
	fetchRemoteCustomTypes,
	fetchRemoteSlices,
	readLocalCustomTypes,
	readLocalSlices,
} from "./lib/custom-types-api";
import { findUpward } from "./lib/file";
import { stringify } from "./lib/json";
import { findSliceModel, getSlicesDirectory, pascalCase } from "./lib/slice";

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

	console.info(`Syncing from repository: ${repo}`);

	if (watch) {
		await watchForChanges(repo);
	} else {
		const result = await syncModels(repo);
		if (!result) {
			return;
		}

		try {
			await buildTypes();
			console.info("Updated types in prismicio-types.d.ts");
		} catch (error) {
			console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
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

async function syncModels(repo: string): Promise<SyncResult | undefined> {
	// Fetch remote and local data in parallel
	const [remoteTypesResult, remoteSlicesResult, localTypesResult, localSlicesResult] =
		await Promise.all([
			fetchRemoteCustomTypes(repo),
			fetchRemoteSlices(repo),
			readLocalCustomTypes(),
			readLocalSlices(),
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

	if (!localTypesResult.ok) {
		console.error(`Failed to read local custom types: ${localTypesResult.error}`);
		process.exitCode = 1;
		return;
	}

	if (!localSlicesResult.ok) {
		console.error(`Failed to read local slices: ${localSlicesResult.error}`);
		process.exitCode = 1;
		return;
	}

	const remoteTypes = remoteTypesResult.value;
	const remoteSlices = remoteSlicesResult.value;
	const localTypes = localTypesResult.value;
	const localSlices = localSlicesResult.value;

	// Find project root for custom types path
	const projectRoot = await findUpward("package.json");
	if (!projectRoot) {
		console.error("Could not find project root (no package.json found)");
		process.exitCode = 1;
		return;
	}
	const projectDir = new URL(".", projectRoot);
	const customTypesDir = new URL("customtypes/", projectDir);

	const remoteTypesById = new Map(remoteTypes.map((t) => [t.id, t]));
	const localTypesById = new Map(localTypes.map((t) => [t.id, t]));
	const remoteSlicesById = new Map(remoteSlices.map((s) => [s.id, s]));
	const localSlicesById = new Map(localSlices.map((s) => [s.id, s]));

	let typesUpdated = 0;
	let typesDeleted = 0;
	let typesCreated = 0;

	// Update existing custom types
	for (const remoteType of remoteTypes) {
		if (localTypesById.has(remoteType.id)) {
			const typeDir = new URL(`${remoteType.id}/`, customTypesDir);
			const modelPath = new URL("index.json", typeDir);
			await mkdir(typeDir, { recursive: true });
			await writeFile(modelPath, stringify(remoteType));
			typesUpdated++;
		}
	}

	// Delete local custom types not in remote
	for (const localType of localTypes) {
		if (!remoteTypesById.has(localType.id)) {
			const typeDir = new URL(`${localType.id}/`, customTypesDir);
			await rm(typeDir, { recursive: true, force: true });
			typesDeleted++;
		}
	}

	// Create new custom types from remote
	for (const remoteType of remoteTypes) {
		if (!localTypesById.has(remoteType.id)) {
			const typeDir = new URL(`${remoteType.id}/`, customTypesDir);
			const modelPath = new URL("index.json", typeDir);
			await mkdir(typeDir, { recursive: true });
			await writeFile(modelPath, stringify(remoteType));
			typesCreated++;
		}
	}

	let slicesUpdated = 0;
	let slicesDeleted = 0;
	let slicesCreated = 0;

	// Update existing slices
	for (const remoteSlice of remoteSlices) {
		if (localSlicesById.has(remoteSlice.id)) {
			const found = await findSliceModel(remoteSlice.id);
			if (found.ok) {
				await writeFile(found.modelPath, stringify(remoteSlice));
				slicesUpdated++;
			}
		}
	}

	// Delete local slices not in remote
	for (const localSlice of localSlices) {
		if (!remoteSlicesById.has(localSlice.id)) {
			const found = await findSliceModel(localSlice.id);
			if (found.ok) {
				const sliceDir = new URL(".", found.modelPath);
				await rm(sliceDir, { recursive: true, force: true });
				slicesDeleted++;
			}
		}
	}

	// Create new slices from remote
	const slicesDir = await getSlicesDirectory();
	for (const remoteSlice of remoteSlices) {
		if (!localSlicesById.has(remoteSlice.id)) {
			const sliceDir = new URL(`${pascalCase(remoteSlice.name)}/`, slicesDir);
			const modelPath = new URL("model.json", sliceDir);
			await mkdir(sliceDir, { recursive: true });
			await writeFile(modelPath, stringify(remoteSlice));
			slicesCreated++;
		}
	}

	return { typesCreated, typesUpdated, typesDeleted, slicesCreated, slicesUpdated, slicesDeleted };
}

async function watchForChanges(repo: string): Promise<void> {
	// Initial sync
	const result = await syncModels(repo);
	if (!result) {
		return;
	}

	try {
		await buildTypes();
		console.info("Updated types in prismicio-types.d.ts");
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
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

				await syncModels(repo);

				try {
					await buildTypes();
					console.info("Updated types in prismicio-types.d.ts");
				} catch (error) {
					console.warn(
						`Could not generate types: ${error instanceof Error ? error.message : error}`,
					);
				}

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
