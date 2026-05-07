import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import * as z from "zod/mini";

import type { Profile } from "./clients/user";

import { DEFAULT_PRISMIC_HOST, env } from "./env";
import { detectAgent } from "./lib/ai";
import { readJsonFile } from "./lib/file";
import { initSegment, trackEvent, trackIdentity } from "./lib/segment";
import { appendTrailingSlash } from "./lib/url";

const PROD_WRITE_KEY = "cGjidifKefYb6EPaGaqpt8rQXkv5TD6P";
const STAGING_WRITE_KEY = "Ng5oKJHCGpSWplZ9ymB7Pu7rm0sTDeiG";

let repository: string | undefined;
let agent: string | undefined;

export async function initTracking(config: { host: string }): Promise<void> {
	if (env.TEST) return;
	const { host } = config;
	const enabled = await isTelemetryEnabled();
	if (!enabled) return;
	const writeKey = host === DEFAULT_PRISMIC_HOST ? PROD_WRITE_KEY : STAGING_WRITE_KEY;
	agent = await detectAgent();
	await initSegment({ writeKey });
}

export function setTrackedRepository(repo: string): void {
	repository = repo;
}

export function trackUser(profile: Profile): void {
	trackIdentity({ userId: profile.shortId, intercomHash: profile.intercomHash });
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
		},
		groupId: repository ? { Repository: repository } : undefined,
	});
}

const PrismicRcSchema = z.object({
	telemetry: z.boolean(),
});

async function isTelemetryEnabled(): Promise<boolean> {
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
