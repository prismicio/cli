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

		The command runs until you stop it. Agents should run it in the
		background and give the user the URL from its "Type Builder:" line.

		Local mode is in closed alpha.
	`,
	options: {
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		"no-browser": { type: "boolean", description: "Skip opening the Type Builder in the browser" },
	},
} satisfies CommandConfig;

type Release = { repo: string; token: string; host: string; releaseId: string };

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
		await deleteRelease(releaseId, { repo, token, host }).catch(async (error) => {
			console.error(`Couldn't delete the hidden release: ${await getErrorMessage(error)}`);
		});
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
		await watch(adapter, { repo, token, host, releaseId }, values["no-browser"], watching.signal);
	} catch (error) {
		await stop();
		throw error;
	}
});

async function watch(
	adapter: Adapter,
	release: Release,
	noBrowser: boolean | undefined,
	signal: AbortSignal,
): Promise<never> {
	const waitForChange = watchFiles(
		[...(await adapter.getCustomTypeLibraries()), ...(await adapter.getSliceLibraries())],
		signal,
	);

	const [initial, initialRemote] = await Promise.all([
		adapter.getModels(),
		getRemoteModels(release),
	]).catch(throwCommandError);
	await writeRemoteModels(diffModels(initial, initialRemote), release).catch(throwCommandError);
	let last = { local: initial, remote: initial };

	const url = new URL("builder/types", `https://${release.repo}.${release.host}/`);
	url.searchParams.set("r", release.releaseId);
	console.info(`Type Builder: ${url}`);
	if (!noBrowser) openBrowser(url);
	console.info("Syncing local models with the Type Builder (Ctrl+C to stop)");

	let lastErrorMessage: string | undefined;
	while (true) {
		await waitForChange(POLL_INTERVAL_MS);

		try {
			const [local, remote] = await Promise.all([adapter.getModels(), getRemoteModels(release)]);
			const edited = getChangedIds(diffModels(local, last.local));
			const pulled = getChangedIds(diffModels(remote, last.remote)).filter(
				(id) => !edited.includes(id),
			);
			await pullTypeBuilderEdits(adapter, pick(remote, pulled), pick(local, pulled));
			last = { local: pulled.length > 0 ? await adapter.getModels() : local, remote };
			await pushLocalEdits(pick(local, edited), pick(remote, edited), release);
			lastErrorMessage = undefined;
		} catch (error) {
			if (getErrorCode(error) === "RELEASE_NOT_FOUND") throw toCommandError(error);
			const message = (await getErrorMessage(toCommandError(error))) ?? "Unknown error";
			if (message !== lastErrorMessage) console.error(`Sync failed: ${message}`);
			lastErrorMessage = message;
		}
	}
}

async function pushLocalEdits(local: Models, remote: Models, release: Release): Promise<void> {
	const changes = diffModels(local, remote);
	await writeRemoteModels(changes, release);
	const sent = getChangedIds(changes);
	if (sent.length > 0) log(`Sent to the Type Builder: ${sent.join(", ")}`);
}

async function pullTypeBuilderEdits(
	adapter: Adapter,
	remote: Models,
	local: Models,
): Promise<void> {
	const changes = diffModels(remote, local);
	const written = getChangedIds(changes);
	if (written.length === 0) return;
	await adapter.writeModels(changes);
	await adapter.generateTypes();
	log(`Written from the Type Builder: ${written.join(", ")}`);
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
		case "missing_right":
			return new CommandError(
				"Local mode needs an Administrator, Owner, or Super User role on this repository.",
			);
		case "LEGACY_REPOSITORY":
			return new CommandError("Local mode doesn't support this repository yet.");
		case "REPEATABLE_MISMATCH":
			return new CommandError(
				"A type can't switch between repeatable and single in local mode. Restore its `repeatable` value in the local model.",
			);
		case "RELEASE_NOT_FOUND":
			return new CommandError("The hidden release was deleted. Run `prismic dev` again.");
	}
	if (!(error instanceof RequestError)) return error;
	const details = z.safeParse(BulkErrorBodySchema, error.body).data?.details;
	if (!details) return error;
	return new CommandError(
		[...details.customTypes, ...details.slices]
			.map(({ id, error }) => `${id}: ${error}`)
			.join("\n"),
	);
}

const ModelErrorsSchema = z.array(z.object({ id: z.string(), error: z.string() }));
const BulkErrorBodySchema = z.object({
	details: z.object({ customTypes: ModelErrorsSchema, slices: ModelErrorsSchema }),
});

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
