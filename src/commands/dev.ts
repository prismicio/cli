import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as z from "zod/mini";

import { getAdapter } from "../adapters";
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

	const adapter = await getAdapter();
	const {
		repo = (await adapter.getEnvironment()) ?? (await getRepositoryName()),
		continue: continueSession,
		new: newSession,
		"no-browser": noBrowser,
	} = values;
	const { token, host } = await getCredentials();

	const projectHash = createHash("sha256")
		.update(fileURLToPath(await findProjectRoot()))
		.digest("hex");
	const sessionPath = new URL(`dev/${projectHash}.json`, CONFIG_DIR);
	const previous = await readJsonFile(sessionPath, { schema: SessionSchema }).catch(() => {});
	if (previous && isRunning(previous.pid)) {
		throw new CommandError(
			`A session is already running for this project. Press Ctrl+C in its terminal to end it, or run \`kill ${previous.pid}\`.`,
		);
	}
	if (continueSession && !previous) {
		throw new CommandError(
			"There is no session to continue. Run `prismic dev` to start a new one.",
		);
	}

	if (previous && !continueSession) {
		if (!newSession) {
			const remote = await getRemoteModels({
				repo: previous.repo,
				token,
				host,
				releaseId: previous.releaseId,
			}).catch(() => {});
			const local = await adapter.getModels();
			if (
				remote &&
				plan(fingerprint(local), fingerprint(remote), previous.synced).pull.length > 0
			) {
				throw new CommandError(
					"Your last session has Type Builder changes that were not pulled.\nRun `prismic dev --continue` to continue the session, or `prismic dev --new` to start a new one without them.",
				);
			}
		}
		await deleteRelease(previous.releaseId, { repo: previous.repo, token, host }).catch(() => {});
	}

	let session: z.infer<typeof SessionSchema>;
	if (previous && continueSession) {
		session = { ...previous, pid: process.pid };
		console.info(`Continuing your session for ${repo}...`);
	} else {
		console.info(`Preparing your session for ${repo}...`);
		session = {
			repo,
			releaseId: await createRelease(
				{ label: "prismic dev", hidden: true },
				{ repo, token, host },
			).catch((error) => {
				throw toCommandError(error);
			}),
			pid: process.pid,
			synced: {},
		};
	}
	const { releaseId } = session;

	const sync = async (push = true): Promise<Models> => {
		const [local, remote] = await Promise.all([
			adapter.getModels(),
			getRemoteModels({ repo, token, host, releaseId }),
		]);
		const localFingerprints = fingerprint(local);
		const remoteFingerprints = fingerprint(remote);
		const changes = plan(localFingerprints, remoteFingerprints, session.synced);

		if (changes.pull.length > 0) {
			await adapter.writeModels(diffModels(pick(remote, changes.pull), pick(local, changes.pull)));
			await adapter.generateTypes();
		}
		const pulled = changes.pull.filter((id) => id in remoteFingerprints);
		if (pulled.length > 0) log(`↓ Pulled ${pulled.join(", ")}`);

		const toPush = push ? changes.push : [];
		await writeRemoteModels(diffModels(pick(local, toPush), pick(remote, toPush)), {
			repo,
			token,
			host,
			releaseId,
		});
		const pushed = toPush.filter((id) => id in localFingerprints);
		if (pushed.length > 0) log(`↑ Pushed ${pushed.join(", ")}`);

		const deleted = [
			...changes.pull.filter((id) => !(id in remoteFingerprints)),
			...toPush.filter((id) => !(id in localFingerprints)),
		];
		if (deleted.length > 0) log(`− Deleted ${deleted.join(", ")}`);

		const current = changes.pull.length > 0 ? await adapter.getModels() : local;
		session.synced = fingerprint(current);
		await writeFileRecursive(sessionPath, stringify(session));
		return current;
	};

	const end = async (): Promise<boolean> => {
		try {
			await sync(false);
			await deleteRelease(releaseId, { repo, token, host });
			await rm(sessionPath, { force: true });
			return true;
		} catch (error) {
			console.error(
				`Could not end the session: ${await getErrorMessage(error)}\nRun \`prismic dev --continue\` to continue it.`,
			);
			return false;
		}
	};

	const stopping = new AbortController();
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
		process.on(signal, () => {
			process.stdout.on("error", () => {});
			process.stderr.on("error", () => {});
			stopping.abort();
		});
	}

	try {
		const waitForChange = watchFiles(
			[...(await adapter.getCustomTypeLibraries()), ...(await adapter.getSliceLibraries())],
			stopping.signal,
		);

		let local: Models;
		if (continueSession) {
			local = await sync();
		} else {
			local = await adapter.getModels();
			const remote = await getRemoteModels({ repo, token, host, releaseId });
			await writeRemoteModels(diffModels(local, remote), {
				repo,
				token,
				host,
				releaseId,
			});
			session.synced = fingerprint(local);
			await writeFileRecursive(sessionPath, stringify(session));
		}
		const types = local.customTypes.length;
		const slices = local.slices.length;
		console.info(
			`Ready. Loaded ${types} ${types === 1 ? "type" : "types"} and ${slices} ${slices === 1 ? "slice" : "slices"} from your project.\n`,
		);

		const url = new URL("builder/types", `https://${repo}.${host}/`);
		url.searchParams.set("r", releaseId);
		console.info(`Type Builder: ${url}`);
		if (noBrowser) {
			console.info("Open the URL above to start editing. Changes sync both ways while this runs.");
		} else {
			openBrowser(url);
			console.info("Opened in your browser. Changes sync both ways while this runs.");
		}
		console.info("Press Ctrl+C to end the session.\n");

		let failures = 0;
		let lastError: string | undefined;
		while (true) {
			await waitForChange(POLL_INTERVAL_MS);
			if (stopping.signal.aborted) break;
			try {
				await sync();
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
	} catch (error) {
		stopping.abort();
		if (error instanceof UnauthorizedRequestError) {
			throw new CommandError(
				"Your login expired. Run `prismic login`, then `prismic dev --continue` to continue the session.",
			);
		}
		if (error instanceof NotFoundRequestError) {
			throw new CommandError("The session ended. Run `prismic dev` to start a new one.");
		}
		if (!(error instanceof ForbiddenRequestError)) await end();
		throw toCommandError(error);
	}

	console.info("\nEnding the session...");
	if (await end()) console.info("Session ended.");
});

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
		...models.customTypes.map((model) => [model.id, hash(canonicalizeCustomType(model))]),
		...models.slices.map((model) => [model.id, hash(canonicalizeSlice(model))]),
	]);
}

function pick(models: Models, ids: string[]): Models {
	return {
		customTypes: models.customTypes.filter((model) => ids.includes(model.id)),
		slices: models.slices.filter((model) => ids.includes(model.id)),
	};
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
