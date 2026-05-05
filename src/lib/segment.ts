import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { name as packageName, version as packageVersion } from "../../package.json";

const SEGMENT_TRACK_URL = "https://api.segment.io/v1/track";
const SEGMENT_IDENTIFY_URL = "https://api.segment.io/v1/identify";

const trackEvents: TrackedEvent[] = [];
const identifyEvents: TrackedIdentity[] = [];
const anonymousId = crypto.randomUUID();
let userId: string | undefined;

type TrackedEvent = {
	event: string;
	properties: Record<string, unknown>;
	context: {
		app: { name: string; version: string };
		groupId?: Record<string, string>;
	};
	userId?: string;
	anonymousId: string;
	timestamp: string;
};

type TrackedIdentity = {
	userId: string;
	anonymousId: string;
	integrations: { Intercom: { user_hash: string } };
	context: { app: { name: string; version: string } };
	timestamp: string;
};

export async function initSegment(config: { writeKey: string }): Promise<void> {
	const { writeKey } = config;
	process.on("exit", () => flushEvents({ writeKey }));
}

export function trackIdentity(identity: { userId: string; intercomHash: string }): void {
	userId = identity.userId;
	identifyEvents.push({
		userId: identity.userId,
		anonymousId,
		integrations: { Intercom: { user_hash: identity.intercomHash } },
		context: {
			app: {
				name: packageName,
				version: packageVersion,
			},
		},
		timestamp: new Date().toISOString(),
	});
}

export function trackEvent(
	event: string,
	config: { properties?: Record<string, unknown>; groupId?: Record<string, string> } = {},
): void {
	const { properties, groupId } = config;
	trackEvents.push({
		event,
		properties: {
			nodeVersion: process.versions.node,
			...properties,
		},
		context: {
			app: {
				name: packageName,
				version: packageVersion,
			},
			groupId,
		},
		userId,
		anonymousId,
		timestamp: new Date().toISOString(),
	});
}

function flushEvents(config: { writeKey: string }): void {
	const { writeKey } = config;

	if (trackEvents.length === 0 && identifyEvents.length === 0) return;

	try {
		const payload = Buffer.from(
			JSON.stringify({
				trackEvents: trackEvents.map((event) => ({
					...event,
					userId: event.userId || userId,
				})),
				identifyEvents,
				writeKey,
			}),
		).toString("base64");

		const script = fileURLToPath(new URL("./subprocesses/sendSegmentEvents.mjs", import.meta.url));
		const child = spawn(process.execPath, [script, payload], {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
	} catch {
		// Silent failure — never breaks the CLI
	}

	trackEvents.length = 0;
	identifyEvents.length = 0;
}

export async function sendSegmentEvents(
	trackEvents: unknown[],
	identifyEvents: unknown[],
	writeKey: string,
): Promise<void> {
	const headers = {
		"Content-Type": "application/json",
		Authorization: `Basic ${btoa(writeKey + ":")}`,
	};

	await Promise.allSettled([
		...trackEvents.map((e) =>
			fetch(SEGMENT_TRACK_URL, { method: "POST", headers, body: JSON.stringify(e) }).catch(
				() => {},
			),
		),
		...identifyEvents.map((e) =>
			fetch(SEGMENT_IDENTIFY_URL, { method: "POST", headers, body: JSON.stringify(e) }).catch(
				() => {},
			),
		),
	]);
}
