import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { env } from "../env";
import { getErrorMessage } from "../error";
import { createCommand, type CommandConfig, CommandError } from "../lib/command";
import { diffArrays } from "../lib/diff";
import { getCustomTypes, getSlices } from "../lib/prismic/clients/custom-types";
import { completeOnboardingStepsSilently } from "../lib/prismic/clients/repository";
import { resolveEnvironment } from "../lib/prismic/environments";
import { getRepositoryName } from "../project";
import { trackCommandStart, trackCommandEnd } from "../tracking";

const POLL_INTERVAL_MS = env.PRISMIC_SYNC_POLL_MS ?? 5000;
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
		env: { type: "string", short: "e", description: "Environment domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo: parentRepo = await getRepositoryName(), env: envFlag } = values;

	const { token, host } = await getCredentials();
	const adapter = await getAdapter();

	const repo = envFlag
		? await resolveEnvironment(envFlag, { repo: parentRepo, token, host })
		: parentRepo;

	trackCommandStart("sync", { watch: true });
	process.on("SIGINT", () => {
		console.info("\nWatch stopped. Goodbye!");
		trackCommandEnd("sync", { watch: true });
		process.exit(0);
	});

	console.info(
		`Watching repository: ${parentRepo}${envFlag ? ` (env: ${envFlag})` : ""} (polling every ${POLL_INTERVAL_MS / 1000}s, Ctrl+C to stop)`,
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
				const localCustomTypeModels = localCustomTypes.map((c) => c.model);
				const localSliceModels = localSlices.map((s) => s.model);

				const changed: string[] = [];

				const sliceOps = diffArrays(remoteSlices, localSliceModels, { getKey: (m) => m.id });
				if (sliceOps.insert.length + sliceOps.update.length + sliceOps.delete.length > 0) {
					for (const slice of sliceOps.update) {
						await adapter.updateSlice(slice);
					}
					for (const slice of sliceOps.delete) {
						await adapter.deleteSlice(slice.id);
					}
					for (const slice of sliceOps.insert) {
						await adapter.createSlice(slice);
					}
					changed.push("slices");
				}

				const customTypeOps = diffArrays(remoteCustomTypes, localCustomTypeModels, {
					getKey: (m) => m.id,
				});
				if (
					customTypeOps.insert.length + customTypeOps.update.length + customTypeOps.delete.length >
					0
				) {
					for (const customType of customTypeOps.update) {
						await adapter.updateCustomType(customType);
					}
					for (const customType of customTypeOps.delete) {
						await adapter.deleteCustomType(customType.id);
					}
					for (const customType of customTypeOps.insert) {
						await adapter.createCustomType(customType);
					}
					changed.push("custom types");
				}

				await adapter.generateTypes();

				lastHash = nextHash;

				if (isInitial) {
					await completeOnboardingStepsSilently({
						repo: parentRepo,
						token,
						host,
						stepIds: ["connectPrismic"],
					});
					console.info("Initial sync complete.");
				} else {
					const timestamp = new Date().toLocaleTimeString();
					console.info(`[${timestamp}] Changes detected in ${changed.join(" and ")}`);
				}
			}

			consecutiveErrors = 0;
		} catch (error) {
			consecutiveErrors++;
			const message = (await getErrorMessage(error)) ?? "Unknown error";
			console.error(`Error checking for changes: ${message}`);
			if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
				throw new CommandError(
					`Too many consecutive errors (${MAX_CONSECUTIVE_ERRORS}), stopping watch.`,
				);
			}
		}

		await setTimeout(POLL_INTERVAL_MS);
	}
});

function hash(data: unknown): string {
	return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
