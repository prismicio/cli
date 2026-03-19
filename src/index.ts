#!/usr/bin/env node

import { parseArgs } from "node:util";

import packageJson from "../package.json" with { type: "json" };
import { getAdapter, NoSupportedFrameworkError } from "./adapters";
import { getHost, refreshToken } from "./auth";
import { getProfile } from "./clients/user";
import { init } from "./commands/init";
import { login } from "./commands/login";
import { logout } from "./commands/logout";
import { sync } from "./commands/sync";
import { whoami } from "./commands/whoami";
import { InvalidPrismicConfig, MissingPrismicConfig } from "./config";
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
import { webhook } from "./commands/webhook";

const HELP = `
Prismic CLI for managing repositories and configurations.

USAGE
  prismic <command> [flags]

COMMANDS
  init        Initialize a Prismic project
  sync        Sync types and slices from Prismic
  webhook     Manage webhooks
  login       Log in to Prismic
  logout      Log out of Prismic
  whoami      Show the currently logged in user

FLAGS
  -v, --version  Show CLI version
  -h, --help     Show help for command

LEARN MORE
  Use \`prismic <command> --help\` for more information about a command.
`.trim();

const UNTRACKED_COMMANDS = new Set(["login", "logout", "whoami", "sync"]);
const SKIP_REFRESH_COMMANDS = new Set(["login", "logout"]);

const {
	positionals,
	values: { version, help },
} = parseArgs({
	options: {
		help: { type: "boolean", short: "h" },
		version: { type: "boolean", short: "v" },
	},
	allowPositionals: true,
	strict: false,
});

setupSentry();
await initSegment();

if (version) {
	console.info(packageJson.version);
} else {
	const command = positionals[0];

	const repository = await safeGetRepositoryName();
	if (repository) {
		segmentSetRepository(repository);
		sentrySetTag("repository", repository);
		sentrySetContext("Repository Data", { name: repository });
	}

	try {
		const adapter = await getAdapter();
		sentrySetTag("framework", adapter.id);
	} catch {
		// noop - it's okay if we can't set the framework
	}

	if (command && !help && !SKIP_REFRESH_COMMANDS.has(command)) {
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

	if (command && !UNTRACKED_COMMANDS.has(command)) {
		segmentTrackStart(command, { repository });
	}

	try {
		switch (command) {
			case "init":
				await init();
				break;
			case "sync":
				await sync();
				break;
			case "login":
				await login();
				break;
			case "logout":
				await logout();
				break;
			case "webhook":
				await webhook();
				break;
			case "whoami":
				await whoami();
				break;
			default: {
				if (command) {
					console.error(`Unknown command: ${command}`);
					process.exitCode = 1;
				}
				console.info(HELP);
			}
		}

		if (command && !UNTRACKED_COMMANDS.has(command)) {
			segmentTrackEnd(command, process.exitCode !== 1);
		}
	} catch (error) {
		if (command && !UNTRACKED_COMMANDS.has(command)) {
			segmentTrackEnd(command, false, error);
		}

		process.exitCode = 1;

		if (error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError) {
			console.error("Not logged in. Run `prismic login` first.");
		} else if (error instanceof InvalidPrismicConfig) {
			console.error(`${error.message} Run \`prismic init\` to re-create a config.`);
		} else if (error instanceof MissingPrismicConfig) {
			console.error(`${error.message} Run \`prismic init\` to create a config.`);
		} else if (error instanceof NoSupportedFrameworkError) {
			console.error(error.message);
		} else {
			await sentryCaptureError(error);
			throw error;
		}
	}
}
