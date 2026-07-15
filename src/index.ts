#!/usr/bin/env node

import { parseArgs } from "node:util";

import packageJson from "../package.json" with { type: "json" };
import { getAdapter, NoSupportedFrameworkError } from "./adapters";
import { cleanupLegacyAuthFile, getCredentials, spawnTokenRefresh } from "./auth";
import docs from "./commands/docs";
import field from "./commands/field";
import gen from "./commands/gen";
import init from "./commands/init";
import locale from "./commands/locale";
import login from "./commands/login";
import logout from "./commands/logout";
import preview from "./commands/preview";
import pull from "./commands/pull";
import push from "./commands/push";
import repo from "./commands/repo";
import slice from "./commands/slice";
import status from "./commands/status";
import sync from "./commands/sync";
import token from "./commands/token";
import type_ from "./commands/type";
import webhook from "./commands/webhook";
import whoami from "./commands/whoami";
import { UPDATE_NOTIFIER_STATE_PATH } from "./config";
import { env } from "./env";
import { CommandError, createCommandRouter } from "./lib/command";
import { decodePayload } from "./lib/jwt";
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
import { InvalidPrismicConfigError, MissingPrismicConfigError } from "./project";
import { safeGetRepositoryName, TypeBuilderRequiredError } from "./project";
import {
	initTracking,
	setTrackedRepository,
	trackCommandEnd,
	trackCommandStart,
	trackUser,
} from "./tracking";

const UNTRACKED_COMMANDS = ["login", "logout", "whoami", "sync", "docs", "status"];

const router = createCommandRouter({
	name: "prismic",
	description: "Prismic CLI for managing repositories and configurations.",
	sections: {
		DOCUMENTATION: `
			Run \`prismic docs list\` to browse available documentation topics.
			Run \`prismic docs view <path>\` to read a topic.
		`,
	},
	commands: {
		init: {
			handler: init,
			description: "Initialize a Prismic project",
		},
		docs: {
			handler: docs,
			description: "Browse Prismic documentation",
		},
		gen: {
			handler: gen,
			description: "Generate files from local models",
		},
		pull: {
			handler: pull,
			description: "Pull types and slices from Prismic",
		},
		push: {
			handler: push,
			description: "Push types and slices to Prismic",
		},
		sync: {
			handler: sync,
			description: "Sync types and slices from Prismic",
		},
		status: {
			handler: status,
			description: "Show local vs remote model differences",
		},
		locale: {
			handler: locale,
			description: "Manage locales",
		},
		repo: {
			handler: repo,
			description: "Manage repositories",
		},
		type: {
			handler: type_,
			description: "Manage content types",
		},
		field: {
			handler: field,
			description: "Manage fields",
		},
		slice: {
			handler: slice,
			description: "Manage slices",
		},
		preview: {
			handler: preview,
			description: "Manage preview configurations",
		},
		token: {
			handler: token,
			description: "Manage API tokens",
		},
		webhook: {
			handler: webhook,
			description: "Manage webhooks",
		},
		login: {
			handler: login,
			description: "Log in to Prismic",
		},
		logout: {
			handler: logout,
			description: "Log out of Prismic",
		},
		whoami: {
			handler: whoami,
			description: "Show the currently logged in user",
		},
	},
});

await main();

async function main(): Promise<void> {
	await initUpdateNotifier({
		npmPackageName: packageJson.name,
		statePath: UPDATE_NOTIFIER_STATE_PATH,
	});

	cleanupLegacyAuthFile().catch(() => {});

	let {
		positionals: [command],
		values: { version, help, repo = await safeGetRepositoryName() },
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

	if (typeof repo !== "string") repo = "";

	if (!help) {
		const { token, host } = await getCredentials();

		if (env.PRISMIC_SENTRY_ENABLED ?? env.PROD) {
			setupSentry({
				dsn: env.PRISMIC_SENTRY_DSN,
				appName: packageJson.name,
				appVersion: packageJson.version,
				environment: env.PRISMIC_SENTRY_ENVIRONMENT,
			});
		}
		await initTracking({ host });

		if (repo) {
			setTrackedRepository(repo);
			sentrySetTag("repository", repo);
			sentrySetContext("Repository Data", { name: repo });
		}

		try {
			const adapter = await getAdapter();
			sentrySetTag("framework", adapter.id);
		} catch {
			// noop - it's okay if we can't set the framework
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

		if (command && !UNTRACKED_COMMANDS.includes(command)) {
			trackCommandStart(command);
		}
	}

	try {
		await router();

		if (command && !UNTRACKED_COMMANDS.includes(command)) {
			trackCommandEnd(command);
		}
	} catch (error) {
		process.exitCode = 1;

		let message: string | undefined;
		try {
			message = await formatError(error);
		} catch {
			// If formatting fails, fall through to reporting the original error.
		}

		if (command && !UNTRACKED_COMMANDS.includes(command)) {
			trackCommandEnd(command, { error: message ?? error });
		}

		if (message !== undefined) {
			console.error(message);
			return;
		}

		// Unknown error: report it and rethrow so the stack is printed.
		await sentryCaptureError(error);
		throw error;
	}
}

// Maps a known error to its user-facing message, or `undefined` if the error is
// unexpected and should be reported to Sentry.
async function formatError(error: unknown): Promise<string | undefined> {
	if (error instanceof CommandError) {
		return dedent(error.message);
	}

	if (error instanceof FieldExistsError) {
		return `Field "${error.id}" already exists.`;
	}

	if (error instanceof FieldNotFoundError) {
		return `Field "${error.id}" does not exist.`;
	}

	if (error instanceof UnsupportedNestedFieldError) {
		return `Field "${error.id}" does not support nested fields.`;
	}

	if (error instanceof FieldSelectionError) {
		return error.message;
	}

	if (error instanceof TabNotFoundError) {
		return `Tab "${error.id}" does not exist on type "${error.customTypeId}".`;
	}

	if (error instanceof SliceVariationNotFoundError) {
		return `Variation "${error.id}" does not exist on slice "${error.sliceId}".`;
	}

	if (error instanceof NoSupportedFrameworkError) {
		return error.message;
	}

	if (error instanceof InvalidEnvironmentError) {
		if (
			error.availableEnvironments.length === 1 &&
			error.repo === error.availableEnvironments[0].domain
		) {
			return `No environments available on repository "${error.repo}".`;
		}
		const list = error.availableEnvironments.map((environment) => environment.domain).join("\n");
		return dedent`
			Environment "${error.env}" not found on repository "${error.repo}".

			Available environments:
			  ${list}
		`;
	}

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

	if (error instanceof NotFoundRequestError) {
		return error.message || "Not found. Verify the repository and any specified identifiers exist.";
	}

	if (error instanceof UnknownRequestError) {
		if (error.message) {
			return error.message;
		}
		const url = new URL(error.response.url);
		// Prevent logging sensitive data like a token
		url.search = "";
		return dedent`
			A network request failed unexpectedly:

			  ${url}

			If this error happens repeatedly, report the issue here: https://github.com/prismicio/cli/issues
		`;
	}

	if (error instanceof InvalidPrismicConfigError) {
		return `${error.message} Run \`prismic init\` to re-create a config.`;
	}

	if (error instanceof MissingPrismicConfigError) {
		return `${error.message} Run \`prismic init\` to create a config.`;
	}

	if (error instanceof TypeBuilderRequiredError) {
		return dedent`
			This command requires the Type Builder in your repository.

			Enable it by turning off Legacy Builder in your repository settings:
			https://${error.repo}.${error.host}/settings/repository/

			Learn more at https://prismic.io/docs/type-builder
		`;
	}

	return undefined;
}
