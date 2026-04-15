import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../../package.json" with { type: "json" };
import { env } from "../env";

let enabled = false;
let anonymousId = "";
let userId: string | undefined;
let globalRepository: string | undefined;
const appContext = { app: { name: packageJson.name, version: packageJson.version } };
const trackQueue: Array<{
	event: string;
	properties: Record<string, unknown>;
	context: Record<string, unknown>;
}> = [];
const identifyQueue: Array<Record<string, unknown>> = [];

export async function initSegment(): Promise<void> {
	try {
		if (env.TEST) {
			return;
		}
		enabled = await isTelemetryEnabled();
		if (!enabled) {
			return;
		}

		anonymousId = randomUUID();
		process.on("exit", flushTelemetry);
	} catch {
		enabled = false;
	}
}

export type TrackContext = { repository?: string; watch?: boolean };

export function segmentTrackStart(command: string, context: TrackContext = {}): void {
	if (!enabled) return;

	const { repository = globalRepository, watch } = context;

	const properties: Record<string, unknown> = {
		commandType: command,
		fullCommand: process.argv.join(" "),
	};
	if (repository) properties.repository = repository;
	if (watch !== undefined) properties.watch = watch;

	trackQueue.push({
		event: "Prismic CLI Start",
		properties,
		context: buildContext(repository),
	});
}

export function segmentTrackEnd(
	command: string,
	context: TrackContext & { success?: boolean; error?: unknown } = {},
): void {
	if (!enabled) return;

	const { success = !process.exitCode, error, repository = globalRepository, watch } = context;

	const properties: Record<string, unknown> = {
		commandType: command,
		fullCommand: process.argv.join(" "),
		success,
	};
	if (repository) properties.repository = repository;
	if (watch !== undefined) properties.watch = watch;
	if (error !== undefined) {
		const message = error instanceof Error ? error.message : String(error);
		properties.error = message.slice(0, 512);
	}

	trackQueue.push({
		event: "Prismic CLI End",
		properties,
		context: buildContext(repository),
	});
}

export function segmentIdentify(profile: { shortId: string; intercomHash: string }): void {
	if (!enabled) {
		return;
	}

	userId = profile.shortId;

	identifyQueue.push({
		userId,
		anonymousId,
		integrations: { Intercom: { user_hash: profile.intercomHash } },
		context: appContext,
		timestamp: new Date().toISOString(),
	});
}

export function segmentSetRepository(repo: string): void {
	globalRepository = repo;
}

function buildContext(repository: string | undefined): Record<string, unknown> {
	const context: Record<string, unknown> = { ...appContext };
	if (repository) context.groupId = { Repository: repository };
	return context;
}

/**
 * Spawns a detached subprocess to send queued telemetry events.
 * The main process exits immediately; the subprocess handles HTTP delivery.
 */
function flushTelemetry(): void {
	if (trackQueue.length === 0 && identifyQueue.length === 0) {
		return;
	}

	try {
		const payload = Buffer.from(
			JSON.stringify({
				trackEvents: trackQueue.map((e) => ({
					...(userId ? { userId } : {}),
					anonymousId,
					event: e.event,
					properties: { nodeVersion: process.versions.node, ...e.properties },
					context: e.context,
					timestamp: new Date().toISOString(),
				})),
				identifyEvents: identifyQueue,
			}),
		).toString("base64");

		const script = fileURLToPath(
			new URL("./subprocesses/flush-telemetry.mjs", import.meta.url),
		);
		const child = spawn(process.execPath, [script, payload], {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
	} catch {
		// Silent failure — never breaks the CLI
	}

	trackQueue.length = 0;
	identifyQueue.length = 0;
}

async function isTelemetryEnabled(): Promise<boolean> {
	try {
		// Check user-level .prismicrc
		const userRc = await readJsonFile(join(homedir(), ".prismicrc"));
		if (userRc?.telemetry === false) {
			return false;
		}

		// Check project-level .prismicrc
		const projectRc = await readJsonFile(join(process.cwd(), ".prismicrc"));
		if (projectRc?.telemetry === false) {
			return false;
		}

		return true;
	} catch {
		return true;
	}
}

async function readJsonFile(path: string): Promise<Record<string, unknown> | undefined> {
	try {
		const contents = await readFile(path, "utf8");
		return JSON.parse(contents);
	} catch {
		return undefined;
	}
}
