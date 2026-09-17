import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import * as z from "zod/mini";

import type { Profile } from "./lib/prismic/clients/user";

import { ANALYTICS_IDS_PATH } from "./config";
import { DEFAULT_PRISMIC_HOST } from "./env";
import { detectAgent } from "./lib/ai";
import { readJsonFile, writeFileRecursive } from "./lib/file";
import { stringify } from "./lib/json";
import { initSegment, trackEvent, trackIdentity } from "./lib/segment";
import { appendTrailingSlash } from "./lib/url";

const PROD_WRITE_KEY = "cGjidifKefYb6EPaGaqpt8rQXkv5TD6P";
const STAGING_WRITE_KEY = "Ng5oKJHCGpSWplZ9ymB7Pu7rm0sTDeiG";

// Amplitude counts every ID it has not seen as a new user. Stored IDs keep one
// person one user, across commands and across the documentation they read
// through the CLI.
const AnalyticsIdsSchema = z.object({
	anonymousId: z.string(),
	userId: z.optional(z.string()),
});
type AnalyticsIds = z.infer<typeof AnalyticsIdsSchema>;

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

	await initSegment({ writeKey, ...ids });
}

export function trackUser(profile: Profile, config: { remember: boolean }): void {
	const { remember } = config;
	trackIdentity({ userId: profile.shortId, intercomHash: profile.intercomHash });

	if (remember && ids) {
		ids.userId = profile.shortId;
		void saveIds(ids);
	}
}

export function getTrackedUserId(): string | undefined {
	return ids?.userId;
}

/** Headers that let Prismic count a request as read by this user. */
export function getAnalyticsHeaders(): Record<string, string> {
	if (!ids) return {};

	return {
		"Prismic-Anonymous-Id": ids.anonymousId,
		...(ids.userId ? { "Prismic-User-Id": ids.userId } : {}),
	};
}

/** Logging in or out ends the stored user. The anonymous ID outlives both. */
export async function forgetTrackedUser(): Promise<void> {
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
