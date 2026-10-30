import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

import * as z from "zod/mini";

import { ANALYTICS_IDS_PATH } from "./config";
import { DEFAULT_PRISMIC_HOST, env } from "./env";
import { detectAgent } from "./lib/ai";
import { readJsonFile, writeFileRecursive } from "./lib/file";
import { stringify } from "./lib/json";
import { decodePayload } from "./lib/jwt";
import type { Profile } from "./lib/prismic/clients/user";
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
let auth: string | undefined;
let runtime: string | undefined;
let runtimeProvider: string | undefined;
let userIntent: string | undefined;
let taskId: string | undefined;
let ids: AnalyticsIds | undefined;

export async function initTracking(config: {
	host: string;
	token?: string;
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
	auth = detectAuth(config.token);
	({ runtime, runtimeProvider } = detectRuntime());

	const storedIds = await readIds();
	ids = storedIds ?? { anonymousId: crypto.randomUUID() };
	if (!storedIds) await saveIds(ids);

	initSegment({
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

function detectAuth(token: string | undefined): string {
	if (!token) return "none";
	if (!env.PRISMIC_TOKEN) return "login";
	const payload = decodePayload(token);
	if (!payload) return "unknown-token";
	return payload.type === "machine2machine" ? "write-token" : "user-token";
}

function detectRuntime(): { runtime: string; runtimeProvider?: string } {
	const cloudProvider = detectCloudProvider();
	if (cloudProvider) return { runtime: "cloud", runtimeProvider: cloudProvider };

	const ciProvider = detectCIProvider();
	if (ciProvider || process.env.CI) return { runtime: "ci", runtimeProvider: ciProvider };

	if (
		existsSync("/.dockerenv") ||
		existsSync("/run/.containerenv") ||
		process.env.KUBERNETES_SERVICE_HOST
	) {
		return { runtime: "container" };
	}

	// Hosted sandboxes run Linux, so an unrecognized Linux machine may not be local.
	if (process.platform !== "linux" || process.env.WSL_DISTRO_NAME) return { runtime: "local" };

	return { runtime: "unknown" };
}

function detectCloudProvider(): string | undefined {
	if (process.env.CLAUDE_CODE_REMOTE === "true") return "claude-code";
	if (process.env.CODEX_EXEC_SERVER_REMOTE_BASE_URL) return "codex";
	if (process.env.CURSOR_AGENT && process.env.CLOUD_AGENT_ALL_SECRET_NAMES !== undefined) {
		return "cursor";
	}
	if (process.env.CODESPACES === "true") return "codespaces";
	if (process.env.GITPOD_WORKSPACE_ID) return "gitpod";
	if (process.versions.webcontainer) return "stackblitz";
	if (process.env.REPL_ID) return "replit";
	if (process.env.CODESANDBOX_HOST) return "codesandbox";
	if (process.env.MODAL_SANDBOX_ID) return "modal";
	if (process.env.E2B_SANDBOX) return "e2b";
	if (existsSync("/opt/.devin")) return "devin";
}

function detectCIProvider(): string | undefined {
	if (process.env.GITHUB_ACTIONS === "true") return "github-actions";
	if (process.env.GITLAB_CI) return "gitlab";
	if (process.env.CIRCLECI) return "circleci";
	if (process.env.BITBUCKET_BUILD_NUMBER) return "bitbucket";
	if (process.env.TF_BUILD) return "azure-pipelines";
	if (process.env.JENKINS_URL) return "jenkins";
	if (process.env.BUILDKITE) return "buildkite";
	if (process.env.CODEBUILD_BUILD_ID) return "codebuild";
	if (process.env.TEAMCITY_VERSION) return "teamcity";
	// Vercel also sets VERCEL at runtime, but sets CI only during builds.
	if (process.env.VERCEL && process.env.CI) return "vercel";
	if (process.env.NETLIFY) return "netlify";
	if (process.env.CF_PAGES) return "cloudflare-pages";
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
			auth,
			runtime,
			runtimeProvider,
			userIntent,
			taskId,
		},
		groupId: repository ? { Repository: repository } : undefined,
	});
}

export function trackCommandEnd(
	command: string,
	config: { watch?: boolean; error?: unknown } = {},
): void {
	const { watch, error } = config;
	const errorMessage = error ? (error instanceof Error ? error.message : String(error)) : undefined;
	trackEvent("Prismic CLI End", {
		properties: {
			commandType: command,
			fullCommand: process.argv.join(" "),
			success: !process.exitCode,
			repository,
			watch,
			error: errorMessage?.slice(0, 512),
			agent,
			auth,
			runtime,
			runtimeProvider,
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
		// Check the user-level .prismicrc before calling process.cwd(), which
		// throws if the current directory was deleted.
		if (await isTelemetryDisabledIn(homedir())) return false;

		// Check the project-level .prismicrc
		if (await isTelemetryDisabledIn(process.cwd())) return false;

		return true;
	} catch {
		return true;
	}
}

async function isTelemetryDisabledIn(dir: string): Promise<boolean> {
	const rc = await readJsonFile(new URL(".prismicrc", appendTrailingSlash(pathToFileURL(dir))), {
		schema: PrismicRcSchema,
	}).catch(() => undefined);
	return rc?.telemetry === false;
}
