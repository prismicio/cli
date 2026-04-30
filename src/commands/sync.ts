import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { env } from "../env";
import { createCommand, type CommandConfig } from "../lib/command";
import { segmentTrackEnd, segmentTrackStart } from "../lib/segment";
import { getRepositoryName, writeSnapshot } from "../project";

const POLL_INTERVAL_MS = env.TEST ? 500 : 5000;
const MAX_CONSECUTIVE_ERRORS = 5;

const config = {
	name: "prismic sync",
	description: `
		Watch Prismic and continuously pull changes to local files.

		For one-time pulls, use \`prismic pull\`.
	`,
	options: {
		watch: {
			type: "boolean",
			short: "w",
			description: "Watch for changes and sync continuously",
			required: true,
		},
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const adapter = await getAdapter();

	segmentTrackStart("sync", { watch: true });
	process.on("SIGINT", () => {
		console.info("\nWatch stopped. Goodbye!");
		segmentTrackEnd("sync", { watch: true });
		process.exit(0);
	});

	console.info(
		`Watching repository: ${repo} (polling every ${POLL_INTERVAL_MS / 1000}s, Ctrl+C to stop)`,
	);

	let lastHash = "";
	let consecutiveErrors = 0;

	while (true) {
		try {
			const [remoteCustomTypes, remoteSlices] = await Promise.all([
				getCustomTypes({ repo, token, host }),
				getSlices({ repo, token, host }),
			]);
			const nextHash = hash({ remoteCustomTypes, remoteSlices });

			if (nextHash !== lastHash) {
				const isInitial = lastHash === "";

				const [localCustomTypes, localSlices] = await Promise.all([
					adapter.getCustomTypes(),
					adapter.getSlices(),
				]);

				const changed: string[] = [];

				const slicesChanged =
					JSON.stringify(remoteSlices) !== JSON.stringify(localSlices.map((s) => s.model));
				if (slicesChanged) {
					for (const remote of remoteSlices) {
						if (localSlices.some((s) => s.model.id === remote.id)) {
							await adapter.updateSlice(remote);
						}
					}
					for (const local of localSlices) {
						if (!remoteSlices.some((r) => r.id === local.model.id)) {
							await adapter.deleteSlice(local.model.id);
						}
					}
					for (const remote of remoteSlices) {
						if (!localSlices.some((s) => s.model.id === remote.id)) {
							await adapter.createSlice(remote);
						}
					}
					changed.push("slices");
				}

				const customTypesChanged =
					JSON.stringify(remoteCustomTypes) !==
					JSON.stringify(localCustomTypes.map((c) => c.model));
				if (customTypesChanged) {
					for (const remote of remoteCustomTypes) {
						if (localCustomTypes.some((c) => c.model.id === remote.id)) {
							await adapter.updateCustomType(remote);
						}
					}
					for (const local of localCustomTypes) {
						if (!remoteCustomTypes.some((r) => r.id === local.model.id)) {
							await adapter.deleteCustomType(local.model.id);
						}
					}
					for (const remote of remoteCustomTypes) {
						if (!localCustomTypes.some((c) => c.model.id === remote.id)) {
							await adapter.createCustomType(remote);
						}
					}
					changed.push("custom types");
				}

				await adapter.generateTypes();
				await writeSnapshot(repo, {
					customTypes: remoteCustomTypes,
					slices: remoteSlices,
				});

				lastHash = nextHash;

				if (isInitial) {
					console.info("Initial sync complete.");
				} else {
					const timestamp = new Date().toLocaleTimeString();
					console.info(`[${timestamp}] Changes detected in ${changed.join(" and ")}`);
				}
			}

			consecutiveErrors = 0;
		} catch (error) {
			consecutiveErrors++;
			const message = error instanceof Error ? error.message : "Unknown error";
			console.error(`Error checking for changes: ${message}`);
			if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
				throw new Error(`Too many consecutive errors (${MAX_CONSECUTIVE_ERRORS}), stopping watch.`);
			}
		}

		await setTimeout(POLL_INTERVAL_MS);
	}
});

function hash(data: unknown): string {
	return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
