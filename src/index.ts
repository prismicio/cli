#!/usr/bin/env node

import { parseArgs } from "node:util";

import packageJson from "../package.json" with { type: "json" };
import { getAdapter, NoSupportedFrameworkError } from "./adapters";
import { cleanupLegacyAuthFile, getCredentials, spawnTokenRefresh } from "./auth";
import router from "./commands";
import { UPDATE_NOTIFIER_STATE_PATH } from "./config";
import { env } from "./env";
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
import { dedent } from "./lib/string";
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
	initTracking,
	isTelemetryEnabled,
	trackCommandEnd,
	trackCommandStart,
	trackUser,
} from "./tracking";

const UNTRACKED_COMMANDS = ["login", "logout", "whoami", "sync", "docs", "status"];

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
		values: { version, help, repo: repoValue = await safeGetRepositoryName() },
	} = parseArgs({
		options: {
			version: { type: "boolean", short: "v" },
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
		},
		allowPositionals: true,
		strict: false,
	});

	if (version) {
		console.info(packageJson.version);
		return;
	}

	const repo = typeof repoValue === "string" ? repoValue : undefined;

	if (!help) {
		const { token, host } = await getCredentials();

		const telemetryEnabled = await isTelemetryEnabled();

		if (env.PRISMIC_SENTRY_ENABLED ?? (telemetryEnabled && env.PROD)) {
			await initSentry({ host, repo });
		}
		if (env.PRISMIC_TELEMETRY_ENABLED ?? telemetryEnabled) {
			await initTracking({ host, repo });
		}

		if (token) {
			const exp = decodePayload(token)?.exp;
			const now = Date.now() / 1000;

			if (!exp || exp - now <= 3600) {
				process.on("exit", () => spawnTokenRefresh());
			}

			if (!exp || exp > now) {
				getProfile({ token, host })
					.then((profile) => {
						trackUser(profile);
						sentrySetUser({ id: profile.shortId });
					})
					.catch(() => {});
			}
		}
	}

	const isTracked = !help && command && !UNTRACKED_COMMANDS.includes(command);

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

async function initSentry(options: { host: string; repo: string | undefined }): Promise<void> {
	const { host, repo } = options;

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

	try {
		const adapter = await getAdapter();
		sentrySetTag("framework", adapter.id);
	} catch {
		// noop - it's okay if we can't set the framework
	}
}

async function getErrorMessage(error: unknown): Promise<string | undefined> {
	if (error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError) {
		const { token } = await getCredentials();
		if (!token) {
			return "Not logged in. Run `prismic login` first.";
		}
		if (env.PRISMIC_TOKEN) {
			return "PRISMIC_TOKEN is invalid or expired, or doesn't have access to this repository. Unset it to log in with a browser, or replace it with a valid token.";
		}
		if (error instanceof UnauthorizedRequestError) {
			return "Your session is invalid or expired. Run `prismic login` to sign in again.";
		}
		return "You do not have access to this repository. Check the repository name or log in with an account that has access.";
	}

	if (error instanceof BadRequestError || error instanceof UnknownRequestError) {
		const url = new URL(error.response.url);
		// Prevent logging sensitive data like a token
		url.search = "";
		const context = error.message ? `${error.message}\n\n` : "";
		return dedent`
			${context}Prismic responded with an unexpected error. Try again, and report it if it keeps happening.

			  Status:  ${error.status} ${error.statusText}
			  URL:     ${url}
			  Report:  https://github.com/prismicio/cli/issues
		`;
	}

	if (error instanceof Error) {
		return dedent(error.message);
	}
}
