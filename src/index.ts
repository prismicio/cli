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
import { initUpdateNotifier } from "./lib/update-notifier";
import {
	InvalidLegacySliceMachineConfigError,
	InvalidPrismicConfigError,
	MissingPrismicConfigError,
	safeGetRepositoryName,
	TypeBuilderRequiredError,
	UnknownProjectRootError,
} from "./project";
import {
	getTrackedUserId,
	initTracking,
	isTelemetryEnabled,
	resolveTaskId,
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
			repo: repoValue = await safeGetRepositoryName(),
			"analytics-intent": intentValue,
			"analytics-task-id": taskIdValue,
		},
	} = parseArgs({
		options: {
			version: { type: "boolean", short: "v" },
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
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
	const passedTaskId =
		typeof taskIdValue === "string" && UUID.test(taskIdValue) ? taskIdValue : undefined;

	// An agent that does not pass a task id still gets one, from the CLI's own store. Refusing the
	// command instead cost every agent its first call, and an agent reading the refusal cold has no
	// way to tell an analytics requirement from a prompt injection: same instruction to run code and
	// forward the user's request, arriving the same way, on the stderr of a command that failed.
	const taskId =
		!help && command && detectAgent() ? await resolveTaskId(passedTaskId) : passedTaskId;

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
