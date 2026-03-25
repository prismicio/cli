#!/usr/bin/env node

import { parseArgs } from "node:util";

import packageJson from "../package.json" with { type: "json" };
import { getAdapter, NoSupportedFrameworkError } from "./adapters";
import { getHost, refreshToken } from "./auth";
import { getProfile } from "./clients/user";
import gen from "./commands/gen";
import init from "./commands/init";
import locale from "./commands/locale";
import login from "./commands/login";
import logout from "./commands/logout";
import preview from "./commands/preview";
import repo from "./commands/repo";
import sync from "./commands/sync";
import token from "./commands/token";
import webhook from "./commands/webhook";
import whoami from "./commands/whoami";
import { InvalidPrismicConfig, MissingPrismicConfig } from "./config";
import { CommandError, createCommandRouter } from "./lib/command";
import { ForbiddenRequestError, UnauthorizedRequestError } from "./lib/request";
import {
	initSegment,
	segmentIdentify,
	segmentSetRepository,
	segmentTrackEnd,
	segmentTrackStart,
} from "./lib/segment";
import {
	sentryCaptureError,
	sentrySetContext,
	sentrySetTag,
	sentrySetUser,
	setupSentry,
} from "./lib/sentry";
import { safeGetRepositoryName } from "./project";

const UNTRACKED_COMMANDS = ["login", "logout", "whoami", "sync"];
const SKIP_REFRESH_COMMANDS = ["login", "logout"];

const router = createCommandRouter({
	name: "prismic",
	description: "Prismic CLI for managing repositories and configurations.",
	commands: {
		init: {
			handler: init,
			description: "Initialize a Prismic project",
		},
		gen: {
			handler: gen,
			description: "Generate files from local models",
		},
		sync: {
			handler: sync,
			description: "Sync types and slices from Prismic",
		},
		locale: {
			handler: locale,
			description: "Manage locales",
		},
		repo: {
			handler: repo,
			description: "Manage repositories",
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
		setupSentry();
		await initSegment();

		if (repo) {
			segmentSetRepository(repo);
			sentrySetTag("repository", repo);
			sentrySetContext("Repository Data", { name: repo });
		}

		try {
			const adapter = await getAdapter();
			sentrySetTag("framework", adapter.id);
		} catch {
			// noop - it's okay if we can't set the framework
		}

		if (command && !SKIP_REFRESH_COMMANDS.includes(command)) {
			// Refresh the token and identify the user in the background.
			refreshToken()
				.then(async (token) => {
					if (!token) return;
					const host = await getHost();
					const profile = await getProfile({ token, host });
					segmentIdentify({ shortId: profile.shortId, intercomHash: profile.intercomHash });
					sentrySetUser({ id: profile.shortId });
				})
				.catch(() => {});
		}

		if (command && !UNTRACKED_COMMANDS.includes(command)) {
			segmentTrackStart(command);
		}
	}

	try {
		await router();

		if (command && !UNTRACKED_COMMANDS.includes(command)) {
			segmentTrackEnd(command);
		}
	} catch (error) {
		process.exitCode = 1;

		if (!UNTRACKED_COMMANDS.includes(command)) {
			segmentTrackEnd(command, { error });
		}

		if (error instanceof CommandError || error instanceof NoSupportedFrameworkError) {
			console.error(error.message);
			return;
		}

		if (error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError) {
			console.error("Not logged in. Run `prismic login` first.");
			return;
		}

		if (error instanceof InvalidPrismicConfig) {
			console.error(`${error.message} Run \`prismic init\` to re-create a config.`);
			return;
		}

		if (error instanceof MissingPrismicConfig) {
			console.error(`${error.message} Run \`prismic init\` to create a config.`);
			return;
		}

		await sentryCaptureError(error);
		throw error;
	}
}
