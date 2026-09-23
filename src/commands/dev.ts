import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import * as z from "zod/mini";

import { type Adapter, getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { CONFIG_DIR } from "../config";
import { env } from "../env";
import { getErrorMessage } from "../error";
import { openBrowser } from "../lib/browser";
import { createCommand, type CommandConfig, CommandError } from "../lib/command";
import { readJsonFile, writeFileRecursive } from "../lib/file";
import { stringify } from "../lib/json";
import { createRelease, deleteRelease } from "../lib/prismic/clients/core";
import {
	type BulkChange,
	bulkUpdate,
	getCustomTypes,
	getSlices,
} from "../lib/prismic/clients/custom-types";
import { diffModels, type Models, type ModelsDiff } from "../lib/prismic/models";
import { RequestError } from "../lib/request";
import { findProjectRoot, getRepositoryName } from "../project";
import { trackCommandEnd, trackCommandStart } from "../tracking";

const POLL_INTERVAL_MS = env.PRISMIC_SYNC_POLL_MS ?? 5000;

const config = {
	name: "prismic dev",
	description: `
		Edit the project's content types and slices in the Type Builder without
		changing them in Prismic.

		Creates a hidden release that holds the local models and opens the Type
		Builder on it. Type Builder edits are written to local files, and local
		file changes are sent to the Type Builder. Local files are the source of
		truth. Stopping the command deletes the release.

		Local mode is in closed alpha.
	`,
	options: {
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
	},
} satisfies CommandConfig;

const SessionSchema = z.object({ repo: z.string(), releaseId: z.string(), pid: z.number() });

export default createCommand(config, async ({ values }) => {
	try {
		await startSession(values.repo);
	} catch (error) {
		throw toCommandError(error);
	}
});

async function startSession(repoFlag: string | undefined): Promise<never> {
	const adapter = await getAdapter();
	const repo = repoFlag ?? (await adapter.getEnvironment()) ?? (await getRepositoryName());

	const { token, host } = await getCredentials();
	if (!token) throw new CommandError("Not logged in. Run `prismic login` first.");

	const projectRoot = fileURLToPath(await findProjectRoot());
	const projectHash = createHash("sha256").update(projectRoot).digest("hex");
	const sessionPath = new URL(`dev/${projectHash}.json`, CONFIG_DIR);

	const previous = await readJsonFile(sessionPath, { schema: SessionSchema }).catch(() => {});
	if (previous && isRunning(previous.pid)) {
		throw new CommandError(
			`\`prismic dev\` is already running in this project (PID ${previous.pid}). Stop it first.`,
		);
	}

	if (!(await checkReleaseSupport({ repo, token, host }))) {
		throw new CommandError(`Local mode isn't available on ${host} yet.`);
	}

	if (previous) {
		await deleteRelease(previous.releaseId, { repo: previous.repo, token, host }).catch(() => {});
	}

	const releaseId = await createRelease(
		{ label: "prismic dev", hidden: true },
		{ repo, token, host },
	);
	await writeFileRecursive(sessionPath, stringify({ repo, releaseId, pid: process.pid }));

	const stop = async (): Promise<void> => {
		await deleteRelease(releaseId, { repo, token, host }).catch(() => {});
		await rm(sessionPath, { force: true });
	};

	trackCommandStart("dev");
	for (const signal of ["SIGINT", "SIGTERM"]) {
		process.once(signal, async () => {
			console.info("\nDeleting the hidden release...");
			await stop();
			trackCommandEnd("dev");
			process.exit(0);
		});
	}

	try {
		return await watch(adapter, { repo, token, host, releaseId });
	} catch (error) {
		await stop();
		throw error;
	}
}

async function watch(
	adapter: Adapter,
	release: { repo: string; token: string; host: string; releaseId: string },
): Promise<never> {
	let lastLocal: Models | undefined;
	let lastRemote: Models | undefined;
	let lastErrorMessage: string | undefined;

	while (true) {
		const isInitial = lastLocal === undefined;

		try {
			const [local, customTypes, slices] = await Promise.all([
				adapter.getModels(),
				getCustomTypes(release),
				getSlices(release),
			]);
			const remote = { customTypes, slices };
			// Only models edited on disk go up, so Type Builder edits to other
			// models, or ones a failed write left behind, are pulled instead.
			const edited = lastLocal && getChangedIds(diffModels(local, lastLocal));

			if (!edited || edited.length > 0) {
				const changes = edited
					? diffModels(pick(local, edited), pick(remote, edited))
					: diffModels(local, remote);
				const ids = getChangedIds(changes);
				if (ids.length > 0) await bulkUpdate(toBulkChanges(changes), release);
				lastLocal = lastRemote = local;

				if (isInitial) {
					const url = new URL("builder/types", `https://${release.repo}.${release.host}/`);
					url.searchParams.set("r", release.releaseId);
					console.info(`Type Builder: ${url}`);
					openBrowser(url);
					console.info(
						`Syncing local models with the Type Builder (polling every ${POLL_INTERVAL_MS / 1000}s, Ctrl+C to stop)`,
					);
				} else if (ids.length > 0) {
					log(`Sent to the Type Builder: ${ids.join(", ")}`);
				}
			} else if (lastRemote && getChangedIds(diffModels(remote, lastRemote)).length > 0) {
				const changes = diffModels(remote, local);
				await adapter.writeModels(changes);
				await adapter.generateTypes();
				lastLocal = await adapter.getModels();
				lastRemote = remote;

				const ids = getChangedIds(changes);
				if (ids.length > 0) log(`Written from the Type Builder: ${ids.join(", ")}`);
			}

			lastErrorMessage = undefined;
		} catch (error) {
			if (isInitial || getErrorCode(error) === "RELEASE_NOT_FOUND") {
				throw error;
			}
			const message = (await getErrorMessage(toCommandError(error))) ?? "Unknown error";
			if (message !== lastErrorMessage) console.error(`Sync failed: ${message}`);
			lastErrorMessage = message;
		}

		await setTimeout(POLL_INTERVAL_MS);
	}
}

function pick(models: Models, ids: string[]): Models {
	return {
		customTypes: models.customTypes.filter((model) => ids.includes(model.id)),
		slices: models.slices.filter((model) => ids.includes(model.id)),
	};
}

// An API that predates releases ignores `release` and serves live models, so a
// release write would change them. Only a release-aware API rejects an unknown
// release.
async function checkReleaseSupport(config: {
	repo: string;
	token: string;
	host: string;
}): Promise<boolean> {
	try {
		await getCustomTypes({ ...config, releaseId: "prismic-cli-release-check" });
		return false;
	} catch (error) {
		if (getErrorCode(error) === "RELEASE_NOT_FOUND") return true;
		throw error;
	}
}

function toBulkChanges({ customTypes, slices }: ModelsDiff): BulkChange[] {
	const change = (type: BulkChange["type"], payload: BulkChange["payload"]) => ({
		type,
		id: payload.id,
		payload,
	});
	return [
		...customTypes.insert.map((model) => change("CUSTOM_TYPE_INSERT", model)),
		...customTypes.update.map((model) => change("CUSTOM_TYPE_UPDATE", model)),
		...customTypes.delete.map(({ id }) => change("CUSTOM_TYPE_DELETE", { id })),
		...slices.insert.map((model) => change("SLICE_INSERT", model)),
		...slices.update.map((model) => change("SLICE_UPDATE", model)),
		...slices.delete.map(({ id }) => change("SLICE_DELETE", { id })),
	];
}

function getChangedIds(changes: ModelsDiff): string[] {
	return [...Object.values(changes.customTypes), ...Object.values(changes.slices)]
		.flat()
		.map((model) => model.id);
}

function log(message: string): void {
	console.info(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function isRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

const ErrorBodySchema = z.object({ error: z.string() });

// Wroom and the Custom Types API both name a failure in `{ error: "CODE" }`.
function getErrorCode(error: unknown): string | undefined {
	if (!(error instanceof RequestError)) return;
	return z.safeParse(ErrorBodySchema, error.body).data?.error;
}

function toCommandError(error: unknown): unknown {
	switch (getErrorCode(error)) {
		case "NOT_ADMIN":
		case "missing_right":
			return new CommandError(
				"Local mode needs an Administrator, Owner, or Super User role on this repository.",
			);
		case "FEATURE_DISABLED":
			return new CommandError("Local mode isn't enabled for this repository yet.");
		case "LEGACY_REPOSITORY":
			return new CommandError("Local mode doesn't support this repository yet.");
		case "REPEATABLE_MISMATCH":
			return new CommandError(
				"A type can't switch between repeatable and single in local mode. Restore its `repeatable` value in the local model.",
			);
		case "RELEASE_NOT_FOUND":
			return new CommandError("The hidden release was deleted. Run `prismic dev` again.");
		default:
			return error;
	}
}
