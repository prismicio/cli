import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import * as z from "zod/mini";

import type { Profile } from "./lib/prismic/clients/user";

import { ANALYTICS_IDS_PATH } from "./config";
import { DEFAULT_PRISMIC_HOST, env } from "./env";
import { detectAgent } from "./lib/ai";
import { readJsonFile, writeFileRecursive } from "./lib/file";
import { stringify } from "./lib/json";
import { initSegment, trackEvent, trackIdentity } from "./lib/segment";
import { appendTrailingSlash } from "./lib/url";

const PROD_WRITE_KEY = "cGjidifKefYb6EPaGaqpt8rQXkv5TD6P";
const STAGING_WRITE_KEY = "Ng5oKJHCGpSWplZ9ymB7Pu7rm0sTDeiG";

// Stored IDs tie every command, and every documentation page read through the
// CLI, to one user.
const AnalyticsIdsSchema = z.object({
	anonymousId: z.string(),
	userId: z.optional(z.string()),
});
type AnalyticsIds = z.infer<typeof AnalyticsIdsSchema>;

// A token from the environment can belong to another user, so it neither reads
// nor replaces the stored user.
const usesStoredUser = !env.PRISMIC_TOKEN;

// A profile request started before a login or a logout can still answer, and
// it answers for the user who just left.
let forgotUser = false;

let repository: string | undefined;
let agent: string | undefined;
let userIntent: string | undefined;
let taskId: string | undefined;
let ids: AnalyticsIds | undefined;

export async function initTracking(config: {
	host: string;
	repo?: string;
	userIntent?: string;
	taskId?: string;
}): Promise<void> {
	const { host, repo } = config;
	if (repo) repository = repo;
	userIntent = config.userIntent;
	taskId = config.taskId;
	const writeKey = host === DEFAULT_PRISMIC_HOST ? PROD_WRITE_KEY : STAGING_WRITE_KEY;
	agent = detectAgent();

	const storedIds = await readIds();
	ids = storedIds ?? { anonymousId: crypto.randomUUID() };
	if (!storedIds) await saveIds(ids);

	await initSegment({
		writeKey,
		anonymousId: ids.anonymousId,
		userId: getTrackedUserId(),
	});
}

export function trackUser(profile: Profile): void {
	trackIdentity({ userId: profile.shortId, intercomHash: profile.intercomHash });

	if (usesStoredUser && !forgotUser && ids) {
		ids.userId = profile.shortId;
		void saveIds(ids);
	}
}

export function getTrackedUserId(): string | undefined {
	return usesStoredUser ? ids?.userId : undefined;
}

export function getAnalyticsHeaders(): Record<string, string> {
	if (!ids) return {};

	const userId = getTrackedUserId();

	return {
		"Prismic-Anonymous-Id": ids.anonymousId,
		...(userId ? { "Prismic-User-Id": userId } : {}),
	};
}

export async function forgetTrackedUser(): Promise<void> {
	forgotUser = true;

	const storedIds = await readIds();
	if (storedIds?.userId) await saveIds({ anonymousId: storedIds.anonymousId });
}

async function readIds(): Promise<AnalyticsIds | undefined> {
	return readJsonFile(ANALYTICS_IDS_PATH, { schema: AnalyticsIdsSchema }).catch(() => undefined);
}

async function saveIds(nextIds: AnalyticsIds): Promise<void> {
	await writeFileRecursive(ANALYTICS_IDS_PATH, stringify(nextIds)).catch(() => {});
}

export function trackCommandStart(command: string, config: { watch?: boolean } = {}): void {
	const { watch } = config;
	trackEvent("Prismic CLI Start", {
		properties: {
			commandType: command,
			fullCommand: process.argv.join(" "),
			repository,
			watch,
			agent,
			userIntent,
			taskId,
		},
		groupId: repository ? { Repository: repository } : undefined,
	});
}

export function trackCommandEnd(
	command: string,
	config: { watch?: boolean; success?: boolean; error?: unknown } = {},
): void {
	const { watch, success = !process.exitCode, error } = config;
	const errorMessage = error ? (error instanceof Error ? error.message : String(error)) : undefined;
	trackEvent("Prismic CLI End", {
		properties: {
			commandType: command,
			fullCommand: process.argv.join(" "),
			success,
			repository,
			watch,
			error: errorMessage?.slice(0, 512),
			agent,
			userIntent,
			taskId,
		},
		groupId: repository ? { Repository: repository } : undefined,
	});
}

const PrismicRcSchema = z.object({
	telemetry: z.boolean(),
});

export async function isTelemetryEnabled(): Promise<boolean> {
	try {
		// Check user-level .prismicrc
		const userRc = await readJsonFile(
			new URL(".prismicrc", appendTrailingSlash(pathToFileURL(homedir()))),
			{ schema: PrismicRcSchema },
		).catch(() => ({ telemetry: true }));
		if (userRc.telemetry === false) return false;

		// Check project-level .prismicrc
		const projectRc = await readJsonFile(
			new URL(".prismicrc", appendTrailingSlash(pathToFileURL(process.cwd()))),
			{ schema: PrismicRcSchema },
		).catch(() => ({ telemetry: true }));
		if (projectRc.telemetry === false) return false;

		return true;
	} catch {
		return true;
	}
}

/** A task ID the CLI issued: a prefix it recognises and enough randomness to be unique. */
export function mintTaskId(): string {
	const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
	let out = "";
	for (const byte of randomBytes(16)) out += alphabet[byte % alphabet.length];

	return `pt_${out}`;
}
