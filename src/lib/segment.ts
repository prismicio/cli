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
const FLUSH_TIMEOUT_MS = 3000;

type SegmentClient = {
	track: (event: string, properties: Record<string, unknown>) => void;
	trackAndFlush: (
		event: string,
		properties: Record<string, unknown>,
	) => Promise<void>;
};

let segment: SegmentClient | undefined;

export async function initSegment(): Promise<void> {
	try {
		const enabled = await isTelemetryEnabled();
		if (!enabled) {
			segment = { track: noop, trackAndFlush: asyncNoop };
			return;
		}

		const anonymousId = randomUUID();
		const authorization = `Basic ${btoa(SEGMENT_WRITE_KEY + ":")}`;

		const send = (
			event: string,
			properties: Record<string, unknown>,
		): Promise<void> => {
			return fetch(SEGMENT_TRACK_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: authorization,
				},
				body: JSON.stringify({
					anonymousId,
					event,
					properties: { nodeVersion: process.versions.node, ...properties },
					context: {
						app: { name: packageJson.name, version: packageJson.version },
					},
					timestamp: new Date().toISOString(),
				}),
			}).then(noop, noop);
		};

		segment = {
			track(event, properties) {
				// Fire-and-forget
				send(event, properties);
			},
			async trackAndFlush(event, properties) {
				await Promise.race([
					send(event, properties),
					new Promise<void>((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS)),
				]);
			},
		};
	} catch {
		segment = { track: noop, trackAndFlush: asyncNoop };
	}
}

export function trackStart(command: string): void {
	segment?.track("Prismic CLI Start", {
		commandType: command,
		fullCommand: process.argv.join(" "),
	});
}

export async function trackEnd(
	command: string,
	success: boolean,
	error?: unknown,
): Promise<void> {
	const properties: Record<string, unknown> = {
		commandType: command,
		fullCommand: process.argv.join(" "),
		success,
	};

	if (error !== undefined) {
		const message = error instanceof Error ? error.message : String(error);
		properties.error = message.slice(0, 512);
	}

	await segment?.trackAndFlush("Prismic CLI End", properties);
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

function noop(): void {}
async function asyncNoop(): Promise<void> {}
