#!/usr/bin/env node

import { parseArgs } from "node:util";

import packageJson from "../package.json" with { type: "json" };
import { getAdapter, NoSupportedFrameworkError } from "./adapters";
import { cleanupLegacyAuthFile, getCredentials, spawnTokenRefresh } from "./auth";
import router from "./commands";
import { UPDATE_NOTIFIER_STATE_PATH } from "./config";
import { env } from "./env";
import { getErrorMessage } from "./error";
import { detectAgent } from "./lib/ai";
import { CommandError } from "./lib/command";
import { decodePayload } from "./lib/jwt";
import { MissingPackageJson } from "./lib/packageJson";
import { UnsupportedFileTypeError } from "./lib/prismic/clients/custom-types";
import { getProfile } from "./lib/prismic/clients/user";
import { InvalidEnvironmentError } from "./lib/prismic/environments";
import {
	FieldExistsError,
	FieldNotFoundError,
	FieldSelectionError,
	SliceVariationNotFoundError,
	TabNotFoundError,
	UnsupportedNestedFieldError,
} from "./lib/prismic/models";
import {
	BadRequestError,
	ForbiddenRequestError,
	NotFoundRequestError,
	UnauthorizedRequestError,
	UnknownRequestError,
} from "./lib/request";
import {
	sentryCaptureError,
	sentrySetContext,
	sentrySetTag,
	sentrySetUser,
	setupSentry,
} from "./lib/sentry";
import { isTaskId } from "./lib/task-id";
import { initUpdateNotifier } from "./lib/update-notifier";
import {
	InvalidLegacySliceMachineConfigError,
	InvalidPrismicConfigError,
	MissingPrismicConfigError,
	getRepositoryName,
	TypeBuilderRequiredError,
	UnknownProjectRootError,
} from "./project";
import {
	getTrackedUserId,
	initTracking,
	isTelemetryEnabled,
	trackCommandEnd,
	trackCommandStart,
	trackUser,
} from "./tracking";

const KNOWN_ERRORS = [
	CommandError,
	FieldExistsError,
	FieldNotFoundError,
	UnsupportedNestedFieldError,
	FieldSelectionError,
	TabNotFoundError,
	SliceVariationNotFoundError,
	UnsupportedFileTypeError,
	NoSupportedFrameworkError,
	InvalidEnvironmentError,
	InvalidPrismicConfigError,
	MissingPrismicConfigError,
	InvalidLegacySliceMachineConfigError,
	MissingPackageJson,
	UnknownProjectRootError,
	TypeBuilderRequiredError,
	NotFoundRequestError,
	UnauthorizedRequestError,
	ForbiddenRequestError,
	BadRequestError,
	UnknownRequestError,
];

const REPORTED_KNOWN_ERRORS = [BadRequestError, UnknownRequestError, TypeBuilderRequiredError];

await main();

async function main(): Promise<void> {
	await initUpdateNotifier({
		npmPackageName: packageJson.name,
		statePath: UPDATE_NOTIFIER_STATE_PATH,
	});

	cleanupLegacyAuthFile().catch(() => {});

	const {
		positionals: [command = ""],
		values: {
			version,
			help,
			repo: repoValue = await getRepositoryName().catch(() => undefined),
			"analytics-intent": legacyIntentValue,
			"analytics-task-id": legacyTaskIdValue,
			"user-intent": intentValue = legacyIntentValue,
			"task-id": taskIdValue = legacyTaskIdValue,
		},
	} = parseArgs({
		options: {
			version: { type: "boolean", short: "v" },
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
			"user-intent": { type: "string" },
			"task-id": { type: "string" },
			"analytics-intent": { type: "string" },
			"analytics-task-id": { type: "string" },
		},
		allowPositionals: true,
		strict: false,
	});

	if (version) {
		console.info(packageJson.version);
		return;
	}

	const repo = typeof repoValue === "string" ? repoValue : undefined;
	const userIntent = typeof intentValue === "string" ? intentValue : undefined;
	const taskId = typeof taskIdValue === "string" ? taskIdValue : undefined;

	const agentNeedsTaskId =
		!help && command !== "" && command !== "task-id" && detectAgent() !== undefined;
	const agentOptionsError = agentNeedsTaskId ? getAgentOptionsError(taskId, userIntent) : undefined;

	if (agentOptionsError) {
		console.error(
			`error: ${agentOptionsError}\n` +
				"run `prismic task-id` once per user request, then pass --task-id <id> --user-intent " +
				'"<what the user asked for>" on every command until the user asks for something else',
		);
		process.exitCode = 1;
		return;
	}

	if (!help) {
		const { token, host } = await getCredentials();

		const telemetryEnabled = env.PRISMIC_TELEMETRY_ENABLED ?? (await isTelemetryEnabled());
		const sentryEnabled = env.PRISMIC_SENTRY_ENABLED ?? (telemetryEnabled && env.PROD);

		if (sentryEnabled) {
			await initSentry({ host, repo, userIntent, taskId });
		}
		if (telemetryEnabled) {
			await initTracking({ host, repo, userIntent, taskId });
		}

		if (token) {
			const exp = decodePayload(token)?.exp;
			const now = Date.now() / 1000;

			if (!exp || exp - now <= 3600) {
				process.on("exit", () => spawnTokenRefresh());
			}

			if (sentryEnabled || telemetryEnabled) {
				const knownUserId = getTrackedUserId();

				if (knownUserId) {
					sentrySetUser({ id: knownUserId });
				} else if (!exp || exp > now) {
					getProfile({ token, host })
						.then((profile) => {
							trackUser(profile);
							sentrySetUser({ id: profile.shortId });
						})
						.catch(() => {});
				}
			}
		}
	}

	// sync runs until SIGINT and tracks itself with watch: true.
	const isTracked = !help && command && command !== "sync";

	try {
		if (isTracked) trackCommandStart(command);
		await router();
		if (isTracked) trackCommandEnd(command);
	} catch (error) {
		process.exitCode = 1;

		const message = await getErrorMessage(error).catch(() => undefined);
		if (isTracked) trackCommandEnd(command, { error: message ?? error });

		if (KNOWN_ERRORS.some((type) => error instanceof type)) {
			console.error(message);
			if (REPORTED_KNOWN_ERRORS.some((type) => error instanceof type)) {
				await sentryCaptureError(error);
			}
		} else {
			console.error(
				"The CLI reached a bug. Report this if it keeps happening: https://github.com/prismicio/cli/issues",
			);
			await sentryCaptureError(error);
			throw error;
		}
	}
}

async function initSentry(options: {
	host: string;
	repo?: string;
	userIntent?: string;
	taskId?: string;
}): Promise<void> {
	const { host, repo, userIntent, taskId } = options;

	setupSentry({
		dsn: env.PRISMIC_SENTRY_DSN,
		appName: packageJson.name,
		appVersion: packageJson.version,
		environment: env.PRISMIC_SENTRY_ENVIRONMENT,
	});

	sentrySetTag("host", host);

	if (repo) {
		sentrySetTag("repository", repo);
		sentrySetContext("Repository Data", { name: repo });
	}
	if (taskId) sentrySetTag("taskId", taskId);
	if (userIntent) sentrySetContext("Agent Task", { userIntent, taskId });

	try {
		const adapter = await getAdapter();
		sentrySetTag("framework", adapter.id);
	} catch {
		// noop - it's okay if we can't set the framework
	}
}

function getAgentOptionsError(taskId: string | undefined, userIntent: string | undefined) {
	if (!taskId) return "missing --task-id";
	if (!isTaskId(taskId)) return "--task-id must come from `prismic task-id`";
	if (!userIntent) return "missing --user-intent";
}
