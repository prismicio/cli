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

let enabled = false;
let anonymousId = "";
let authorization = "";
const appContext = { app: { name: packageJson.name, version: packageJson.version } };
const eventQueue: Array<{ event: string; properties: Record<string, unknown> }> = [];

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

export function trackStart(command: string): void {
	if (!enabled) {
		return;
	}

	eventQueue.push({
		event: "Prismic CLI Start",
		properties: {
			commandType: command,
			fullCommand: process.argv.join(" "),
		},
	});
}

export function trackEnd(
	command: string,
	success: boolean,
	error?: unknown,
): void {
	if (!enabled) {
		return;
	}

	const properties: Record<string, unknown> = {
		commandType: command,
		fullCommand: process.argv.join(" "),
		success,
	};

	if (error !== undefined) {
		const message = error instanceof Error ? error.message : String(error);
		properties.error = message.slice(0, 512);
	}

	eventQueue.push({ event: "Prismic CLI End", properties });
}

/**
 * Spawns a detached subprocess to send queued telemetry events.
 * The main process exits immediately; the subprocess handles HTTP delivery.
 */
function flushTelemetry(): void {
	if (eventQueue.length === 0) {
		return;
	}

	try {
		const payload = Buffer.from(
			JSON.stringify({
				url: SEGMENT_TRACK_URL,
				authorization,
				events: eventQueue.map((e) => ({
					anonymousId,
					event: e.event,
					properties: { nodeVersion: process.versions.node, ...e.properties },
					context: appContext,
					timestamp: new Date().toISOString(),
				})),
			}),
		).toString("base64");

		const child = spawn(
			process.execPath,
			["--input-type=module", "-e", FLUSH_SCRIPT, payload],
			{ detached: true, stdio: "ignore" },
		);
		child.unref();
	} catch {
		// Silent failure — never breaks the CLI
	}

	eventQueue.length = 0;
}

const FLUSH_SCRIPT = `
const {url, authorization, events} = JSON.parse(Buffer.from(process.argv[1], "base64"));
const h = {"Content-Type": "application/json", Authorization: authorization};
await Promise.allSettled(events.map(e => fetch(url, {method: "POST", headers: h, body: JSON.stringify(e)}).catch(() => {})));
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

async function readJsonFile(
	path: string,
): Promise<Record<string, unknown> | undefined> {
	try {
		const contents = await readFile(path, "utf8");
		return JSON.parse(contents);
	} catch {
		return undefined;
	}
}
