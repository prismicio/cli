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

	const ctx = await resolveContext(values.repo);
	const session = await openSession(ctx, {
		continueSession: values.continue,
		newSession: values.new,
	});
	const stopping = listenForStop();

	try {
		const waitForChange = await watchModels(ctx, stopping.signal);
		const models = values.continue ? await sync(ctx, session) : await seedRelease(ctx, session);
		announce(ctx, session, models, { noBrowser: values["no-browser"] });
		await syncChangesUntilStopped(ctx, session, waitForChange, stopping.signal);
	} catch (error) {
		stopping.abort();
		throw await handleFailure(error, ctx, session);
	}

	console.info("\nEnding the session...");
	if (await endSession(ctx, session)) console.info("Session ended.");
});

type Context = {
	adapter: Adapter;
	repo: string;
	token: string | undefined;
	host: string;
	sessionPath: URL;
};

type Session = z.infer<typeof SessionSchema>;

type WaitForChange = ReturnType<typeof watchFiles>;

async function resolveContext(repoOption: string | undefined): Promise<Context> {
	const adapter = await getAdapter();
	const repo = repoOption ?? (await adapter.getEnvironment()) ?? (await getRepositoryName());
	const { token, host } = await getCredentials();
	const projectHash = createHash("sha256")
		.update(fileURLToPath(await findProjectRoot()))
		.digest("hex");
	const sessionPath = new URL(`dev/${projectHash}.json`, CONFIG_DIR);
	return { adapter, repo, token, host, sessionPath };
}

async function openSession(
	ctx: Context,
	{ continueSession, newSession }: { continueSession?: boolean; newSession?: boolean },
): Promise<Session> {
	const { repo, token, host, sessionPath } = ctx;

	const previous = await readJsonFile(sessionPath, { schema: SessionSchema }).catch(() => {});
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
		console.info(`Continuing your session for ${repo}...`);
		return { ...previous, pid: process.pid };
	}

	if (previous) {
		if (!newSession && (await hasUnpulledChanges(ctx, previous))) {
			throw new CommandError(
				"Your last session has Type Builder changes that were not pulled.\nRun `prismic dev --continue` to continue the session, or `prismic dev --new` to start a new one without them.",
			);
		}
		await deleteRelease(previous.releaseId, { repo: previous.repo, token, host }).catch(() => {});
	}

	console.info(`Preparing your session for ${repo}...`);
	const releaseId = await createRelease(
		{ label: "prismic dev", hidden: true },
		{ repo, token, host },
	).catch((error) => {
		throw toCommandError(error);
	});
	return { repo, releaseId, pid: process.pid, synced: {} };
}

async function hasUnpulledChanges(ctx: Context, previous: Session): Promise<boolean> {
	const { adapter, token, host } = ctx;
	const remote = await getRemoteModels({
		repo: previous.repo,
		token,
		host,
		releaseId: previous.releaseId,
	}).catch((error) => {
		// A deleted release has nothing left to pull.
		if (error instanceof NotFoundRequestError) return;
		throw toCommandError(error);
	});
	const local = fingerprint(await adapter.getModels());
	if (!remote) return false;
	const remoteFingerprints = fingerprint(remote);
	// Any Type Builder change counts, including one to a model also edited locally.
	return Object.keys({ ...remoteFingerprints, ...previous.synced }).some(
		(key) =>
			remoteFingerprints[key] !== previous.synced[key] && remoteFingerprints[key] !== local[key],
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

async function watchModels(ctx: Context, signal: AbortSignal): Promise<WaitForChange> {
	const { adapter } = ctx;
	return watchFiles(
		[...(await adapter.getCustomTypeLibraries()), ...(await adapter.getSliceLibraries())],
		signal,
	);
}

async function seedRelease(ctx: Context, session: Session): Promise<Models> {
	const { adapter, repo, token, host } = ctx;
	const { releaseId } = session;
	const local = await adapter.getModels();
	const remote = await getRemoteModels({ repo, token, host, releaseId });
	await writeRemoteModels(diffModels(local, remote), { repo, token, host, releaseId });
	session.synced = fingerprint(local);
	await saveSession(ctx, session);
	return local;
}

async function sync(ctx: Context, session: Session, { push = true } = {}): Promise<Models> {
	const { adapter, repo, token, host } = ctx;
	const { releaseId } = session;
	const [local, remote] = await Promise.all([
		adapter.getModels(),
		getRemoteModels({ repo, token, host, releaseId }),
	]);
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
		await saveSession(ctx, session);
	}
	const pulled = changes.pull.filter((id) => id in remoteFingerprints);
	if (pulled.length > 0) log(`↓ Pulled ${names(pulled)}`);

	const toPush = push ? changes.push : [];
	await writeRemoteModels(diffModels(pick(local, toPush), pick(remote, toPush)), {
		repo,
		token,
		host,
		releaseId,
	});
	const pushed = toPush.filter((id) => id in localFingerprints);
	if (pushed.length > 0) log(`↑ Pushed ${names(pushed)}`);

	const deleted = [
		...changes.pull.filter((id) => !(id in remoteFingerprints)),
		...toPush.filter((id) => !(id in localFingerprints)),
	];
	if (deleted.length > 0) log(`− Deleted ${names(deleted)}`);

	session.synced = fingerprint(current);
	await saveSession(ctx, session);
	return current;
}

function announce(
	ctx: Context,
	session: Session,
	models: Models,
	options: { noBrowser?: boolean },
): void {
	const types = models.customTypes.length;
	const slices = models.slices.length;
	console.info(
		`Ready. Loaded ${types} ${types === 1 ? "type" : "types"} and ${slices} ${slices === 1 ? "slice" : "slices"} from your project.\n`,
	);

	const url = new URL("builder/types", `https://${ctx.repo}.${ctx.host}/`);
	url.searchParams.set("r", session.releaseId);
	console.info(`Type Builder: ${url}`);
	if (options.noBrowser) {
		console.info("Open the URL above to start editing. Changes sync both ways while this runs.");
	} else {
		openBrowser(url);
		console.info("Opened in your browser. Changes sync both ways while this runs.");
	}
	console.info("Press Ctrl+C to end the session.\n");
}

async function syncChangesUntilStopped(
	ctx: Context,
	session: Session,
	waitForChange: WaitForChange,
	signal: AbortSignal,
): Promise<void> {
	let failures = 0;
	let lastError: string | undefined;
	while (true) {
		await waitForChange(POLL_INTERVAL_MS);
		if (signal.aborted) return;
		try {
			await sync(ctx, session);
			if (failures >= 6) log("Back in sync.");
			failures = 0;
			lastError = undefined;
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
			const message = temporary
				? "Cannot reach Prismic. Retrying..."
				: ((await getErrorMessage(toCommandError(error))) ?? "Unknown error");
			if (message !== lastError) log(`! ${message}`, console.error);
			lastError = message;
		}
	}
}

async function handleFailure(error: unknown, ctx: Context, session: Session): Promise<unknown> {
	if (error instanceof UnauthorizedRequestError) {
		return new CommandError(
			"Your login expired. Run `prismic login`, then `prismic dev --continue` to continue the session.",
		);
	}
	if (error instanceof NotFoundRequestError) {
		return new CommandError("The session ended. Run `prismic dev` to start a new one.");
	}
	if (!(error instanceof ForbiddenRequestError)) await endSession(ctx, session);
	return toCommandError(error);
}

async function endSession(ctx: Context, session: Session): Promise<boolean> {
	const { repo, token, host, sessionPath } = ctx;
	try {
		await sync(ctx, session, { push: false });
		await deleteRelease(session.releaseId, { repo, token, host });
		await rm(sessionPath, { force: true });
		return true;
	} catch (error) {
		console.error(
			`Could not end the session: ${await getErrorMessage(error)}\nRun \`prismic dev --continue\` to continue it.`,
		);
		return false;
	}
}

async function saveSession(ctx: Context, session: Session): Promise<void> {
	await writeFileRecursive(ctx.sessionPath, stringify(session));
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

function toCommandError(error: unknown): unknown {
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
