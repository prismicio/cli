import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as z from "zod/mini";

import { type Adapter, getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { CONFIG_DIR } from "../config";
import { env } from "../env";
import { getErrorMessage } from "../error";
import { openBrowser } from "../lib/browser";
import { createCommand, type CommandConfig, CommandError } from "../lib/command";
import { readJsonFile, watchFiles, writeFileRecursive } from "../lib/file";
import { stringify } from "../lib/json";
import { createRelease, deleteRelease } from "../lib/prismic/clients/core";
import { getCustomTypes } from "../lib/prismic/clients/custom-types";
import {
	diffModels,
	getRemoteModels,
	type Models,
	type ModelsDiff,
	writeRemoteModels,
} from "../lib/prismic/models";
import { RequestError } from "../lib/request";
import { findProjectRoot, getRepositoryName } from "../project";
import { trackCommandEnd, trackCommandStart } from "../tracking";

const POLL_INTERVAL_MS = env.PRISMIC_SYNC_POLL_MS ?? 5000;

const config = {
	name: "prismic dev",
	description: `
		Edit local content types and slices visually in the Type Builder.

		Type Builder changes are saved to local files, and local file changes
		appear in the Type Builder.

		Local mode is in closed alpha.
	`,
	options: {
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
	},
} satisfies CommandConfig;

type Release = { repo: string; token: string; host: string; releaseId: string };
type Snapshot = { local: Models; remote: Models };

export default createCommand(config, async ({ values }) => {
	const adapter = await getAdapter();
	const repo = values.repo ?? (await adapter.getEnvironment()) ?? (await getRepositoryName());

	const { token, host } = await getCredentials();
	if (!token) throw new CommandError("Not logged in. Run `prismic login` first.");

	const sessionPath = await getSessionPath();
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
	).catch(throwCommandError);
	await writeFileRecursive(sessionPath, stringify({ repo, releaseId, pid: process.pid }));

	const watching = new AbortController();
	const stop = async (): Promise<void> => {
		watching.abort();
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
		await watch(adapter, { repo, token, host, releaseId }, watching.signal);
	} catch (error) {
		await stop();
		throw error;
	}
});

async function watch(adapter: Adapter, release: Release, signal: AbortSignal): Promise<never> {
	let changed = false;
	let wake = (): void => {};
	const libraries = [
		...(await adapter.getCustomTypeLibraries()),
		...(await adapter.getSliceLibraries()),
	];
	watchFiles(
		libraries,
		() => {
			changed = true;
			wake();
		},
		{ signal },
	);

	const [initial, initialRemote] = await Promise.all([
		adapter.getModels(),
		getRemoteModels(release),
	]).catch(throwCommandError);
	await writeRemoteModels(diffModels(initial, initialRemote), release).catch(throwCommandError);
	let last: Snapshot = { local: initial, remote: initial };

	const url = new URL("builder/types", `https://${release.repo}.${release.host}/`);
	url.searchParams.set("r", release.releaseId);
	console.info(`Type Builder: ${url}`);
	openBrowser(url);
	console.info("Syncing local models with the Type Builder (Ctrl+C to stop)");

	let lastErrorMessage: string | undefined;
	while (true) {
		if (!changed) {
			await new Promise<void>((resolve) => {
				const poll = setTimeout(resolve, POLL_INTERVAL_MS);
				wake = () => {
					clearTimeout(poll);
					resolve();
				};
			});
		}
		changed = false;

		try {
			const [local, remote] = await Promise.all([adapter.getModels(), getRemoteModels(release)]);
			const edited = getChangedIds(diffModels(local, last.local));
			if (edited.length > 0) {
				last = await pushLocalEdits(edited, local, remote, release);
			} else if (getChangedIds(diffModels(remote, last.remote)).length > 0) {
				last = await pullTypeBuilderEdits(adapter, local, remote);
			}
			lastErrorMessage = undefined;
		} catch (error) {
			if (getErrorCode(error) === "RELEASE_NOT_FOUND") throw toCommandError(error);
			const message = (await getErrorMessage(toCommandError(error))) ?? "Unknown error";
			if (message !== lastErrorMessage) console.error(`Sync failed: ${message}`);
			lastErrorMessage = message;
		}
	}
}

async function pushLocalEdits(
	ids: string[],
	local: Models,
	remote: Models,
	release: Release,
): Promise<Snapshot> {
	const changes = diffModels(pick(local, ids), pick(remote, ids));
	await writeRemoteModels(changes, release);
	const sent = getChangedIds(changes);
	if (sent.length > 0) log(`Sent to the Type Builder: ${sent.join(", ")}`);
	return { local, remote: local };
}

async function pullTypeBuilderEdits(
	adapter: Adapter,
	local: Models,
	remote: Models,
): Promise<Snapshot> {
	const changes = diffModels(remote, local);
	await adapter.writeModels(changes);
	await adapter.generateTypes();
	const written = getChangedIds(changes);
	if (written.length > 0) log(`Written from the Type Builder: ${written.join(", ")}`);
	return { local: await adapter.getModels(), remote };
}

function pick(models: Models, ids: string[]): Models {
	return {
		customTypes: models.customTypes.filter((model) => ids.includes(model.id)),
		slices: models.slices.filter((model) => ids.includes(model.id)),
	};
}

function getChangedIds(changes: ModelsDiff): string[] {
	return [...Object.values(changes.customTypes), ...Object.values(changes.slices)]
		.flat()
		.map((model) => model.id);
}

function log(message: string): void {
	console.info(`[${new Date().toLocaleTimeString()}] ${message}`);
}

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
		throw toCommandError(error);
	}
}

const ErrorBodySchema = z.object({ error: z.string() });

function getErrorCode(error: unknown): string | undefined {
	if (!(error instanceof RequestError)) return;
	return z.safeParse(ErrorBodySchema, error.body).data?.error;
}

function throwCommandError(error: unknown): never {
	throw toCommandError(error);
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

const SessionSchema = z.object({ repo: z.string(), releaseId: z.string(), pid: z.number() });

async function getSessionPath(): Promise<URL> {
	const projectRoot = fileURLToPath(await findProjectRoot());
	const projectHash = createHash("sha256").update(projectRoot).digest("hex");
	return new URL(`dev/${projectHash}.json`, CONFIG_DIR);
}

function isRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}
