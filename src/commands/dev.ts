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
import { type ArrayDiff, hasChanges } from "../lib/diff";
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
import { ForbiddenRequestError, RequestError, UnauthorizedRequestError } from "../lib/request";
import { findProjectRoot, getRepositoryName } from "../project";
import { trackCommandEnd, trackCommandStart } from "../tracking";

const POLL_INTERVAL_MS = env.PRISMIC_SYNC_POLL_MS ?? 5000;
const FAILURES_BEFORE_WARNING = 6;

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
		continue: { type: "boolean", description: "Continue the previous session" },
		new: {
			type: "boolean",
			description: "Start a new session, even if the previous one has unpulled changes",
		},
		"no-browser": { type: "boolean", description: "Skip opening the Type Builder in the browser" },
	},
} satisfies CommandConfig;

type Release = { repo: string; token: string | undefined; host: string; releaseId: string };
type Fingerprints = Record<string, string>;
type Synced = { local: Fingerprints; remote: Fingerprints };

export default createCommand(config, async ({ values }) => {
	if (values.continue && values.new) {
		throw new CommandError("Use either `--continue` or `--new`, not both.");
	}

	const adapter = await getAdapter();
	const repo = values.repo ?? (await adapter.getEnvironment()) ?? (await getRepositoryName());

	const { token, host } = await getCredentials();

	const sessionPath = await getSessionPath();
	const previous = await readJsonFile(sessionPath, { schema: SessionSchema }).catch(() => {});
	if (previous && isRunning(previous.pid)) {
		throw new CommandError(
			`A session is already running for this project. Press Ctrl+C in its terminal to end it, or run \`kill ${previous.pid}\`.`,
		);
	}

	let session: Session;
	if (values.continue) {
		if (!previous) {
			throw new CommandError(
				"There's no session to continue. Run `prismic dev` to start a new one.",
			);
		}
		session = { ...previous, pid: process.pid };
		console.info(`Continuing your session for ${session.repo}...`);
	} else {
		if (previous) {
			const previousRelease = { repo: previous.repo, token, host, releaseId: previous.releaseId };
			if (!values.new && (await hasUnpulledChanges(adapter, previousRelease, previous.synced))) {
				throw new CommandError(
					"Your last session has Type Builder changes that weren't pulled.\nRun `prismic dev --continue` to continue the session, or `prismic dev --new` to start a new one without them.",
				);
			}
			await deleteRelease(previous.releaseId, previousRelease).catch(() => {});
		}
		console.info(`Preparing your session for ${repo}...`);
		const releaseId = await createRelease(
			{ label: "prismic dev", hidden: true },
			{ repo, token, host },
		).catch(throwCommandError);
		const remote = fingerprint(
			await getRemoteModels({ repo, token, host, releaseId }).catch(throwCommandError),
		);
		session = { repo, releaseId, pid: process.pid, synced: { local: remote, remote } };
	}

	const release = { repo: session.repo, token, host, releaseId: session.releaseId };
	let synced = session.synced;
	const save = async (next: Synced) => {
		synced = next;
		await writeFileRecursive(sessionPath, stringify({ ...session, synced }));
	};
	await save(synced);

	let syncing: Promise<unknown> = Promise.resolve();
	const serially = <T>(task: () => Promise<T>): Promise<T> => {
		const result = syncing.then(task);
		syncing = result.catch(() => {});
		return result;
	};

	const watching = new AbortController();
	const end = async (): Promise<boolean> => {
		watching.abort();
		try {
			await serially(async () =>
				pullChanges(adapter, (await planSync(adapter, release, synced)).pull),
			);
			await deleteRelease(release.releaseId, release);
			await rm(sessionPath, { force: true });
			return true;
		} catch (error) {
			console.error(
				`Couldn't end the session: ${await getErrorMessage(error)}\nRun \`prismic dev --continue\` to continue it.`,
			);
			return false;
		}
	};

	trackCommandStart("dev");
	let ending = false;
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
		process.on(signal, async () => {
			if (ending) return;
			ending = true;
			process.stdout.on("error", () => {});
			process.stderr.on("error", () => {});
			console.info("\nEnding the session...");
			if (await end()) console.info("Session ended.");
			trackCommandEnd("dev");
			process.exit(0);
		});
	}

	try {
		const waitForChange = watchFiles(
			[...(await adapter.getCustomTypeLibraries()), ...(await adapter.getSliceLibraries())],
			watching.signal,
		);
		const first = await sync(adapter, release, synced, Boolean(values.continue));
		await save(first.synced);
		console.info(
			`Ready. Loaded ${count(first.local.customTypes.length, "type")} and ${count(first.local.slices.length, "slice")} from your project.\n`,
		);

		const url = new URL("builder/types", `https://${release.repo}.${release.host}/`);
		url.searchParams.set("r", release.releaseId);
		console.info(`Type Builder: ${url}`);
		if (values["no-browser"]) {
			console.info("Open the URL above to start editing. Changes sync both ways while this runs.");
		} else {
			openBrowser(url);
			console.info("Opened in your browser. Changes sync both ways while this runs.");
		}
		console.info("Press Ctrl+C to end the session.\n");

		await watch(waitForChange, () =>
			serially(async () => save((await sync(adapter, release, synced, true)).synced)),
		);
	} catch (error) {
		watching.abort();
		if (error instanceof UnauthorizedRequestError) {
			throw new CommandError(
				"Your login expired. Run `prismic login`, then `prismic dev --continue` to continue the session.",
			);
		}
		if (getErrorCode(error) === "RELEASE_NOT_FOUND") await rm(sessionPath, { force: true });
		else await end();
		throw toCommandError(error);
	}
});

async function watch(
	waitForChange: (timeoutMs: number) => Promise<void>,
	syncOnce: () => Promise<void>,
): Promise<never> {
	let failures = 0;
	let lastErrorMessage: string | undefined;
	while (true) {
		await waitForChange(POLL_INTERVAL_MS);
		try {
			await syncOnce();
			if (failures >= FAILURES_BEFORE_WARNING) log("Back in sync.");
			failures = 0;
			lastErrorMessage = undefined;
		} catch (error) {
			if (isFatal(error)) throw error;
			if (isTemporary(error)) {
				if (++failures === FAILURES_BEFORE_WARNING) {
					log("! Can't reach Prismic. Retrying...", console.error);
				}
				continue;
			}
			const message = (await getErrorMessage(toCommandError(error))) ?? "Unknown error";
			if (message !== lastErrorMessage) log(`! ${message}`, console.error);
			lastErrorMessage = message;
		}
	}
}

async function sync(
	adapter: Adapter,
	release: Release,
	synced: Synced,
	reportPushes: boolean,
): Promise<{ local: Models; synced: Synced }> {
	const { local, remote, pull, push } = await planSync(adapter, release, synced);
	const pulled = await pullChanges(adapter, pull);
	await writeRemoteModels(push, release);
	if (reportPushes) logChanges(push, "↑ Pushed");
	const current = pulled ? await adapter.getModels() : local;
	return { local: current, synced: { local: fingerprint(current), remote: fingerprint(remote) } };
}

async function planSync(adapter: Adapter, release: Release, synced: Synced) {
	const [local, remote] = await Promise.all([adapter.getModels(), getRemoteModels(release)]);
	const localFingerprints = fingerprint(local);
	const localChanges = getChangedIds(localFingerprints, synced.local);
	const pulled = getChangedIds(fingerprint(remote), synced.remote).filter(
		(id) => !localChanges.includes(id) || !(id in localFingerprints),
	);
	const pushed = localChanges.filter((id) => !pulled.includes(id));
	return {
		local,
		remote,
		pull: diffModels(pick(remote, pulled), pick(local, pulled)),
		push: diffModels(pick(local, pushed), pick(remote, pushed)),
	};
}

async function pullChanges(adapter: Adapter, pull: ModelsDiff): Promise<boolean> {
	if (!hasModelChanges(pull)) return false;
	await adapter.writeModels(pull);
	await adapter.generateTypes();
	logChanges(pull, "↓ Pulled");
	return true;
}

async function hasUnpulledChanges(
	adapter: Adapter,
	release: Release,
	synced: Synced,
): Promise<boolean> {
	const plan = await planSync(adapter, release, synced).catch(() => {});
	return plan ? hasModelChanges(plan.pull) : false;
}

function hasModelChanges(changes: ModelsDiff): boolean {
	return hasChanges(changes.customTypes) || hasChanges(changes.slices);
}

function fingerprint(models: Models): Fingerprints {
	return Object.fromEntries(
		[...models.customTypes, ...models.slices].map((model) => [
			model.id,
			createHash("sha256").update(JSON.stringify(model)).digest("hex"),
		]),
	);
}

function getChangedIds(current: Fingerprints, synced: Fingerprints): string[] {
	const ids = new Set([...Object.keys(current), ...Object.keys(synced)]);
	return [...ids].filter((id) => current[id] !== synced[id]);
}

function pick(models: Models, ids: string[]): Models {
	return {
		customTypes: models.customTypes.filter((model) => ids.includes(model.id)),
		slices: models.slices.filter((model) => ids.includes(model.id)),
	};
}

function getIds(changes: ModelsDiff, kinds: (keyof ArrayDiff<unknown>)[]): string[] {
	return [changes.customTypes, changes.slices].flatMap((diff) =>
		kinds.flatMap((kind) => diff[kind].map((model) => model.id)),
	);
}

function logChanges(changes: ModelsDiff, label: string): void {
	const updated = getIds(changes, ["insert", "update"]);
	const deleted = getIds(changes, ["delete"]);
	if (updated.length > 0) log(`${label} ${updated.join(", ")}`);
	if (deleted.length > 0) log(`− Deleted ${deleted.join(", ")}`);
}

function log(message: string, write = console.info): void {
	const time = new Date().toTimeString().slice(0, 8);
	write(`${time}  ${message.replaceAll("\n", "\n          ")}`);
}

function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function isFatal(error: unknown): boolean {
	return (
		error instanceof UnauthorizedRequestError ||
		error instanceof ForbiddenRequestError ||
		getErrorCode(error) === "RELEASE_NOT_FOUND"
	);
}

function isTemporary(error: unknown): boolean {
	if (error instanceof RequestError) return error.status >= 500 || error.status === 429;
	return error instanceof TypeError && error.message === "fetch failed";
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
				"To edit models in the Type Builder, you need an Administrator, Owner, or Super User role on this repository.",
			);
		case "LEGACY_REPOSITORY":
			return new CommandError("Local mode doesn't support this repository yet.");
		case "REPEATABLE_MISMATCH":
			return new CommandError(
				"A type can't switch between repeatable and single in local mode. Restore its `repeatable` value in the local model.",
			);
		case "RELEASE_NOT_FOUND":
			return new CommandError("The session ended. Run `prismic dev` to start a new one.");
	}
	if (!(error instanceof RequestError)) return error;
	const details = z.safeParse(BulkErrorBodySchema, error.body).data?.details;
	if (!details) return error;
	return new CommandError(
		[...details.customTypes, ...details.slices]
			.map(({ id, error }) => `Couldn't push ${id}: ${error}`)
			.join("\n"),
	);
}

const ModelErrorsSchema = z.array(z.object({ id: z.string(), error: z.string() }));
const BulkErrorBodySchema = z.object({
	details: z.object({ customTypes: ModelErrorsSchema, slices: ModelErrorsSchema }),
});

const FingerprintsSchema = z.record(z.string(), z.string());
const SessionSchema = z.object({
	repo: z.string(),
	releaseId: z.string(),
	pid: z.number(),
	synced: z.object({ local: FingerprintsSchema, remote: FingerprintsSchema }),
});
type Session = z.infer<typeof SessionSchema>;

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
