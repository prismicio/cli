import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import packageJson from "../../package.json" with { type: "json" };

const SEGMENT_WRITE_KEY =
	process.env.PRISMIC_ENV && process.env.PRISMIC_ENV !== "production"
		? "Ng5oKJHCGpSWplZ9ymB7Pu7rm0sTDeiG"
		: "cGjidifKefYb6EPaGaqpt8rQXkv5TD6P";
const SEGMENT_TRACK_URL = "https://api.segment.io/v1/track";
const SEGMENT_IDENTIFY_URL = "https://api.segment.io/v1/identify";

let enabled = false;
let anonymousId = "";
let authorization = "";
let userId: string | undefined;
let repository: string | undefined;
const appContext = { app: { name: packageJson.name, version: packageJson.version } };
const trackQueue: Array<{
	event: string;
	properties: Record<string, unknown>;
	context: Record<string, unknown>;
}> = [];
const identifyQueue: Array<Record<string, unknown>> = [];

export async function initSegment(): Promise<void> {
	try {
		enabled = await isTelemetryEnabled();
		if (!enabled) {
			return;
		}

		anonymousId = randomUUID();
		authorization = `Basic ${btoa(SEGMENT_WRITE_KEY + ":")}`;
		process.on("exit", flushTelemetry);
	} catch {
		enabled = false;
	}
}

export type TrackContext = { repository?: string; watch?: boolean };

export function segmentTrackStart(command: string, ctx?: TrackContext): void {
	if (!enabled) {
		return;
	}

	const repo = ctx?.repository ?? repository;
	const properties: Record<string, unknown> = {
		commandType: command,
		fullCommand: process.argv.join(" "),
	};
	if (repo) {
		properties.repository = repo;
	}

	trackQueue.push({ event: "Prismic CLI Start", properties, context: buildContext(repo) });
}

export function segmentTrackEnd(
	command: string,
	success: boolean,
	error?: unknown,
	ctx?: TrackContext,
): void {
	if (!enabled) {
		return;
	}

	const repo = ctx?.repository ?? repository;
	const properties: Record<string, unknown> = {
		commandType: command,
		fullCommand: process.argv.join(" "),
		success,
	};
	if (repo) {
		properties.repository = repo;
	}
	if (ctx?.watch !== undefined) {
		properties.watch = ctx.watch;
	}

	if (error !== undefined) {
		const message = error instanceof Error ? error.message : String(error);
		properties.error = message.slice(0, 512);
	}

	trackQueue.push({ event: "Prismic CLI End", properties, context: buildContext(repo) });
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
	repository = repo;
}

function buildContext(repo: string | undefined): Record<string, unknown> {
	const context: Record<string, unknown> = { ...appContext };
	if (repo) {
		context.groupId = { Repository: repo };
	}
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
				trackUrl: SEGMENT_TRACK_URL,
				identifyUrl: SEGMENT_IDENTIFY_URL,
				authorization,
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

		const child = spawn(process.execPath, ["--input-type=module", "-e", FLUSH_SCRIPT, payload], {
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

const FLUSH_SCRIPT = `
const {trackUrl, identifyUrl, authorization, trackEvents, identifyEvents} = JSON.parse(Buffer.from(process.argv[1], "base64"));
const h = {"Content-Type": "application/json", Authorization: authorization};
await Promise.allSettled([
	...trackEvents.map(e => fetch(trackUrl, {method: "POST", headers: h, body: JSON.stringify(e)}).catch(() => {})),
	...identifyEvents.map(e => fetch(identifyUrl, {method: "POST", headers: h, body: JSON.stringify(e)}).catch(() => {})),
]);
`;

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
