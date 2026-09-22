import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { name, version } from "../../package.json";

const app = { name, version };
const trackEvents: Record<string, unknown>[] = [];
const identifyEvents: unknown[] = [];
let anonymousId: string;
let userId: string | undefined;

export function initSegment(config: {
	writeKey: string;
	anonymousId: string;
	userId?: string;
}): void {
	anonymousId = config.anonymousId;
	userId = config.userId;
	process.on("exit", () => flushEvents(config.writeKey));
}

export function trackIdentity(identity: { userId: string; intercomHash: string }): void {
	userId = identity.userId;
	identifyEvents.push({
		userId: identity.userId,
		anonymousId,
		integrations: { Intercom: { user_hash: identity.intercomHash } },
		context: { app },
		timestamp: new Date().toISOString(),
	});
}

export function trackEvent(
	event: string,
	config: { properties?: Record<string, unknown>; groupId?: Record<string, string> } = {},
): void {
	trackEvents.push({
		event,
		properties: { nodeVersion: process.versions.node, ...config.properties },
		context: { app, groupId: config.groupId },
		userId,
		anonymousId,
		timestamp: new Date().toISOString(),
	});
}

function flushEvents(writeKey: string): void {
	if (trackEvents.length === 0 && identifyEvents.length === 0) return;

	try {
		const payload = Buffer.from(
			JSON.stringify({
				// Events tracked before an identify get the user identified later.
				trackEvents: trackEvents.map((event) => ({ ...event, userId: event.userId || userId })),
				identifyEvents,
				writeKey,
			}),
		).toString("base64");
		const script = fileURLToPath(new URL("./subprocesses/sendSegmentEvents.mjs", import.meta.url));
		spawn(process.execPath, [script, payload], { detached: true, stdio: "ignore" }).unref();
	} catch {}

	trackEvents.length = 0;
	identifyEvents.length = 0;
}

export async function sendSegmentEvents(
	trackEvents: unknown[],
	identifyEvents: unknown[],
	writeKey: string,
): Promise<void> {
	const send = (endpoint: string, body: unknown): Promise<unknown> =>
		fetch(`https://api.segment.io/v1/${endpoint}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Basic ${btoa(writeKey + ":")}`,
			},
			body: JSON.stringify(body),
		}).catch(() => {});

	await Promise.all([
		...trackEvents.map((e) => send("track", e)),
		...identifyEvents.map((e) => send("identify", e)),
	]);
}
