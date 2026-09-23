import { setTimeout } from "node:timers/promises";

import { getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { env } from "../env";
import { getErrorMessage } from "../error";
import { createCommand, type CommandConfig, CommandError } from "../lib/command";
import { hasChanges } from "../lib/diff";
import { getCustomTypes, getSlices } from "../lib/prismic/clients/custom-types";
import { diffModels, snapshotModels } from "../lib/prismic/models";
import { completeOnboardingSteps } from "../lib/prismic/onboarding";
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
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: {
			type: "string",
			short: "e",
			description: "Alias for --repo",
			deprecated: "Use `prismic env` or --repo instead.",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const adapter = await getAdapter();

	const {
		env: envFlag,
		repo = envFlag ?? (await adapter.getEnvironment()) ?? (await getRepositoryName()),
	} = values;

	const { token, host } = await getCredentials();

	trackCommandStart("sync", { watch: true });
	process.on("SIGINT", () => {
		console.info("\nWatch stopped. Goodbye!");
		trackCommandEnd("sync", { watch: true });
		process.exit(0);
	});

	console.info(
		`Watching repository: ${repo} (polling every ${POLL_INTERVAL_MS / 1000}s, Ctrl+C to stop)`,
	);

	let lastSnapshot = "";
	let consecutiveErrors = 0;

	while (true) {
		try {
			const [customTypes, slices] = await Promise.all([
				getCustomTypes({ repo, token, host }),
				getSlices({ repo, token, host }),
			]);
			const remote = { customTypes, slices };
			const nextSnapshot = snapshotModels(remote);

			if (nextSnapshot !== lastSnapshot) {
				const isInitial = lastSnapshot === "";

				const diff = diffModels(remote, await adapter.getModels(), {
					treatNonCanonicalAsChanged: true,
				});
				await adapter.writeModels(diff);
				const changed = [
					...(hasChanges(diff.slices) ? ["slices"] : []),
					...(hasChanges(diff.customTypes) ? ["custom types"] : []),
				];

				if (isInitial || changed.length > 0) {
					await adapter.generateTypes();
				}

				lastSnapshot = nextSnapshot;

				if (isInitial) {
					await completeOnboardingSteps(["connectPrismic"], {
						repo: await getRepositoryName(),
						token,
						host,
					}).catch(() => {});
					console.info("Initial sync complete.");
				} else if (changed.length > 0) {
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
