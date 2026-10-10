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
import { createCommand, type CommandConfig, CommandError, exclusiveOptions } from "../lib/command";
import { readJsonFile, watchFiles, writeFileRecursive } from "../lib/file";
import { stringify } from "../lib/json";
import { createRelease, deleteRelease } from "../lib/prismic/clients/core";
import type { CustomTypesConfig } from "../lib/prismic/clients/custom-types";
import {
	canonicalizeCustomType,
	canonicalizeSlice,
	diffModels,
	getRemoteModels,
	type Models,
	writeRemoteModels,
} from "../lib/prismic/models";
import {
	ForbiddenRequestError,
	NotFoundRequestError,
	RequestError,
	UnauthorizedRequestError,
} from "../lib/request";
import { findProjectRoot, getRepositoryName } from "../project";

const POLL_INTERVAL_MS = env.PRISMIC_SYNC_POLL_MS ?? 5000;

const config = {
	name: "prismic dev",
	description: `
		Edit local content types and slices visually in the Type Builder.

		Type Builder changes are saved to local files, and local file changes
		appear in the Type Builder.

		The command runs until you stop it. Agents should run it in the
		background and give the user the URL from its "Type Builder:" line.

		@experimental - This command may change or be removed in any release and does not follow semver.
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

export default createCommand(config, async ({ values }) => {
	exclusiveOptions(values, ["continue", "new"]);

	const adapter = await getAdapter();
	const {
		repo = (await adapter.getEnvironment()) ?? (await getRepositoryName()),
		continue: continueSession,
		new: newSession,
		"no-browser": noBrowser,
	} = values;
	const { token, host } = await getCredentials();

	const sessionPath = await getSessionPath();
	const previous = await resolvePreviousSession(adapter, sessionPath, {
		token,
		host,
		continueSession,
		newSession,
	});

	let session: Session;
	if (previous) {
		session = { ...previous, pid: process.pid };
		console.info(`Continuing your session for ${repo}...`);
	} else {
		console.info(`Preparing your session for ${repo}...`);
		session = await createSession({ repo, token, host });
	}
	const release = { repo, token, host, releaseId: session.releaseId };
	const sync = (push = true) =>
		syncModels(adapter, release, session, sessionPath, {
			push,
			onPull: (ids) => log(`↓ Pulled ${names(ids)}`),
			onPush: (ids) => log(`↑ Pushed ${names(ids)}`),
			onDelete: (ids) => log(`− Deleted ${names(ids)}`),
		});

	const end = async (): Promise<boolean> => {
		try {
			await sync(false);
			await endSession(release, sessionPath);
			return true;
		} catch (error) {
			console.error(
				`Could not end the session: ${await getErrorMessage(error)}\nRun \`prismic dev --continue\` to continue it.`,
			);
			return false;
		}
	};

	const stopping = listenForStop();
	try {
		const waitForChange = watchFiles(
			[...(await adapter.getCustomTypeLibraries()), ...(await adapter.getSliceLibraries())],
			stopping.signal,
		);
		const models = continueSession
			? await sync()
			: await seedRelease(adapter, release, session, sessionPath);
		const types = models.customTypes.length;
		const slices = models.slices.length;
		console.info(
			`Ready. Loaded ${types} ${types === 1 ? "type" : "types"} and ${slices} ${slices === 1 ? "slice" : "slices"} from your project.\n`,
		);

		const url = new URL("builder/types", `https://${repo}.${host}/`);
		url.searchParams.set("r", release.releaseId);
		console.info(`Type Builder: ${url}`);
		if (noBrowser) {
			console.info("Open the URL above to start editing. Changes sync both ways while this runs.");
		} else {
			openBrowser(url);
			console.info("Opened in your browser. Changes sync both ways while this runs.");
		}
		console.info("Press Ctrl+C to end the session.\n");

		let lastError: string | undefined;
		const logError = (message: string) => {
			if (message !== lastError) log(`! ${message}`, console.error);
			lastError = message;
		};
		await syncUntilStopped(sync, waitForChange, stopping.signal, {
			onSync: () => {
				lastError = undefined;
			},
			onRecover: () => log("Back in sync."),
			onUnreachable: () => logError("Cannot reach Prismic. Retrying..."),
			onError: async (error) =>
				logError((await getErrorMessage(explainRequestError(error))) ?? "Unknown error"),
		});
	} catch (error) {
		stopping.abort();
		throw await handleFailure(error, end);
	}

	console.info("\nEnding the session...");
	if (await end()) console.info("Session ended.");
});

type Session = z.infer<typeof SessionSchema>;
type Release = CustomTypesConfig & { releaseId: string };

async function getSessionPath(): Promise<URL> {
	const projectHash = createHash("sha256")
		.update(fileURLToPath(await findProjectRoot()))
		.digest("hex");
	return new URL(`dev/${projectHash}.json`, CONFIG_DIR);
}

async function readSession(sessionPath: URL): Promise<Session | undefined> {
	return readJsonFile(sessionPath, { schema: SessionSchema }).catch(() => undefined);
}

async function saveSession(sessionPath: URL, session: Session): Promise<void> {
	await writeFileRecursive(sessionPath, stringify(session));
}

async function createSession({ repo, token, host }: CustomTypesConfig): Promise<Session> {
	const releaseId = await createRelease(
		{ label: "prismic dev", hidden: true },
		{ repo, token, host },
	).catch((error) => {
		throw explainRequestError(error);
	});
	return { repo, releaseId, pid: process.pid, synced: {} };
}

async function endSession({ releaseId, ...config }: Release, sessionPath: URL): Promise<void> {
	await deleteRelease(releaseId, config);
	await rm(sessionPath, { force: true });
}

async function resolvePreviousSession(
	adapter: Adapter,
	sessionPath: URL,
	options: {
		token: string | undefined;
		host: string;
		continueSession?: boolean;
		newSession?: boolean;
	},
): Promise<Session | undefined> {
	const { token, host, continueSession, newSession } = options;
	const previous = await readSession(sessionPath);
	if (previous && isRunning(previous.pid)) {
		throw new CommandError(
			`A session is already running for this project. Press Ctrl+C in its terminal to end it, or run \`kill ${previous.pid}\`.`,
		);
	}
	if (continueSession) {
		if (!previous) {
			throw new CommandError(
				"There is no session to continue. Run `prismic dev` to start a new one.",
			);
		}
		return previous;
	}
	if (!previous) return;

	if (!newSession) {
		const unpulled = await hasUnpulledChanges(
			adapter,
			{ repo: previous.repo, token, host, releaseId: previous.releaseId },
			previous.synced,
		);
		if (unpulled) {
			throw new CommandError(
				"Your last session has Type Builder changes that were not pulled.\nRun `prismic dev --continue` to continue the session, or `prismic dev --new` to start a new one without them.",
			);
		}
	}
	await deleteRelease(previous.releaseId, { repo: previous.repo, token, host }).catch(() => {});
}

async function hasUnpulledChanges(
	adapter: Adapter,
	release: Release,
	synced: Record<string, string>,
): Promise<boolean> {
	const remote = await getRemoteModels(release).catch((error) => {
		// A deleted release has nothing left to pull.
		if (error instanceof NotFoundRequestError) return;
		throw explainRequestError(error);
	});
	const local = fingerprint(await adapter.getModels());
	if (!remote) return false;
	const remoteFingerprints = fingerprint(remote);
	// Any Type Builder change counts, including one to a model also edited locally.
	return Object.keys({ ...remoteFingerprints, ...synced }).some(
		(key) => remoteFingerprints[key] !== synced[key] && remoteFingerprints[key] !== local[key],
	);
}

function listenForStop(): AbortController {
	const stopping = new AbortController();
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
		process.on(signal, () => {
			process.stdout.on("error", () => {});
			process.stderr.on("error", () => {});
			stopping.abort();
		});
	}
	return stopping;
}

async function seedRelease(
	adapter: Adapter,
	release: Release,
	session: Session,
	sessionPath: URL,
): Promise<Models> {
	const local = await adapter.getModels();
	const remote = await getRemoteModels(release);
	await writeRemoteModels(diffModels(local, remote), release);
	session.synced = fingerprint(local);
	await saveSession(sessionPath, session);
	return local;
}

async function syncModels(
	adapter: Adapter,
	release: Release,
	session: Session,
	sessionPath: URL,
	options: {
		push: boolean;
		onPull: (ids: string[]) => void;
		onPush: (ids: string[]) => void;
		onDelete: (ids: string[]) => void;
	},
): Promise<Models> {
	const { push, onPull, onPush, onDelete } = options;
	const [local, remote] = await Promise.all([adapter.getModels(), getRemoteModels(release)]);
	const localFingerprints = fingerprint(local);
	const remoteFingerprints = fingerprint(remote);
	const changes = plan(localFingerprints, remoteFingerprints, session.synced);

	let current = local;
	if (changes.pull.length > 0) {
		await adapter.writeModels(diffModels(pick(remote, changes.pull), pick(local, changes.pull)));
		await adapter.generateTypes();
		current = await adapter.getModels();
		// Save the pulls before pushing, so a rejected push cannot make them look like local edits.
		const currentFingerprints = fingerprint(current);
		for (const id of changes.pull) {
			if (id in currentFingerprints) session.synced[id] = currentFingerprints[id];
			else delete session.synced[id];
		}
		await saveSession(sessionPath, session);
	}
	const pulled = changes.pull.filter((id) => id in remoteFingerprints);
	if (pulled.length > 0) onPull(pulled);

	const toPush = push ? changes.push : [];
	await writeRemoteModels(diffModels(pick(local, toPush), pick(remote, toPush)), release);
	const pushed = toPush.filter((id) => id in localFingerprints);
	if (pushed.length > 0) onPush(pushed);

	const deleted = [
		...changes.pull.filter((id) => !(id in remoteFingerprints)),
		...toPush.filter((id) => !(id in localFingerprints)),
	];
	if (deleted.length > 0) onDelete(deleted);

	session.synced = fingerprint(current);
	await saveSession(sessionPath, session);
	return current;
}

async function syncUntilStopped(
	sync: () => Promise<unknown>,
	waitForChange: (timeoutMs: number) => Promise<void>,
	signal: AbortSignal,
	callbacks: {
		onSync: () => void;
		onRecover: () => void;
		onUnreachable: () => void;
		onError: (error: unknown) => Promise<void>;
	},
): Promise<void> {
	const { onSync, onRecover, onUnreachable, onError } = callbacks;
	let failures = 0;
	while (true) {
		await waitForChange(POLL_INTERVAL_MS);
		if (signal.aborted) return;
		try {
			await sync();
			if (failures >= 6) onRecover();
			failures = 0;
			onSync();
		} catch (error) {
			if (
				error instanceof UnauthorizedRequestError ||
				error instanceof ForbiddenRequestError ||
				error instanceof NotFoundRequestError
			) {
				throw error;
			}
			const temporary =
				error instanceof RequestError
					? error.status >= 500 || error.status === 429
					: error instanceof TypeError && error.message === "fetch failed";
			if (temporary && ++failures < 6) continue;
			if (temporary) onUnreachable();
			else await onError(error);
		}
	}
}

async function handleFailure(error: unknown, end: () => Promise<boolean>): Promise<unknown> {
	if (error instanceof UnauthorizedRequestError) {
		return new CommandError(
			"Your login expired. Run `prismic login`, then `prismic dev --continue` to continue the session.",
		);
	}
	if (error instanceof NotFoundRequestError) {
		return new CommandError("The session ended. Run `prismic dev` to start a new one.");
	}
	if (!(error instanceof ForbiddenRequestError)) await end();
	return explainRequestError(error);
}

function plan(
	local: Record<string, string>,
	remote: Record<string, string>,
	synced: Record<string, string>,
): { pull: string[]; push: string[] } {
	const pull: string[] = [];
	const push: string[] = [];
	for (const id of new Set([
		...Object.keys(local),
		...Object.keys(remote),
		...Object.keys(synced),
	])) {
		if (local[id] === remote[id]) continue;
		const localChanged = local[id] !== synced[id];
		const remoteChanged = remote[id] !== synced[id];
		if (!localChanged || (remoteChanged && !(id in local))) pull.push(id);
		else push.push(id);
	}
	return { pull, push };
}

function fingerprint(models: Models): Record<string, string> {
	const hash = (model: unknown) => createHash("sha256").update(JSON.stringify(model)).digest("hex");
	return Object.fromEntries([
		...models.customTypes.map((model) => [`type:${model.id}`, hash(canonicalizeCustomType(model))]),
		...models.slices.map((model) => [`slice:${model.id}`, hash(canonicalizeSlice(model))]),
	]);
}

function pick(models: Models, keys: string[]): Models {
	return {
		customTypes: models.customTypes.filter((model) => keys.includes(`type:${model.id}`)),
		slices: models.slices.filter((model) => keys.includes(`slice:${model.id}`)),
	};
}

function names(keys: string[]): string {
	return keys.map((key) => key.slice(key.indexOf(":") + 1)).join(", ");
}

function log(message: string, write = console.info): void {
	const time = new Date().toTimeString().slice(0, 8);
	write(`${time}  ${message.replaceAll("\n", "\n          ")}`);
}

function isRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

function explainRequestError(error: unknown): unknown {
	if (!(error instanceof RequestError)) return error;
	switch (z.safeParse(z.object({ error: z.string() }), error.body).data?.error) {
		case "missing_right":
			return new CommandError(
				"To edit models in the Type Builder, you need an Administrator, Owner, or Super User role on this repository.",
			);
		case "LEGACY_REPOSITORY":
			return new CommandError("Local mode does not support this repository yet.");
	}
	const details = z.safeParse(BulkErrorBodySchema, error.body).data?.details;
	if (!details) return error;
	return new CommandError(
		[...details.customTypes, ...details.slices]
			.map(({ id, error }) => `Could not push ${id}: ${error}`)
			.join("\n"),
	);
}

const ModelErrorsSchema = z.array(z.object({ id: z.string(), error: z.string() }));
const BulkErrorBodySchema = z.object({
	details: z.object({ customTypes: ModelErrorsSchema, slices: ModelErrorsSchema }),
});

const SessionSchema = z.object({
	repo: z.string(),
	releaseId: z.string(),
	pid: z.number(),
	synced: z.record(z.string(), z.string()),
});
