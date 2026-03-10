#!/usr/bin/env node

import { parseArgs } from "node:util";

import packageJson from "../package.json" with { type: "json" };
import { getProfile } from "./clients/user";
import { getFramework } from "./framework";
import { init } from "./init";
import { getHost, refreshToken } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { ForbiddenRequestError, UnauthorizedRequestError } from "./lib/request";
import { identify, initSegment, setRepository, trackEnd, trackStart } from "./lib/segment";
import { captureError, setContext, setTag, setUser, setupSentry } from "./lib/sentry";
import { login } from "./login";
import { logout } from "./logout";
import { sync } from "./sync";
import { whoami } from "./whoami";

const HELP = `
Prismic CLI for managing repositories and configurations.

USAGE
  prismic <command> [flags]

COMMANDS
  init        Initialize a Prismic project
  sync        Sync types and slices from Prismic
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
	values: { version },
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

	const repository = await safeGetRepositoryFromConfig();
	if (repository) {
		setRepository(repository);
		setTag("repository", repository);
		setContext("Repository Data", { name: repository });
	}

	const framework = await getFramework();
	if (framework) {
		setTag("framework", framework.id);
	}

	if (!SKIP_REFRESH_COMMANDS.has(command)) {
		// Refreesh the token and identify the user in the background.
		refreshToken().then(async (token) => {
			if (!token) return;
			const host = await getHost();
			const profile = await getProfile({ token, host });
			identify({ shortId: profile.shortId, intercomHash: profile.intercomHash });
			setUser({ id: profile.shortId });
		});
	}

	if (!UNTRACKED_COMMANDS.has(command)) {
		trackStart(command, { repository });
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

		if (!UNTRACKED_COMMANDS.has(command)) {
			trackEnd(command, process.exitCode !== 1);
		}
	} catch (error) {
		if (!UNTRACKED_COMMANDS.has(command)) {
			trackEnd(command, false, error);
		}
		process.exitCode = 1;

		if (error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError) {
			console.error("Not logged in. Run `prismic login` first.");
		} else {
			await captureError(error);
			throw error;
		}
	}
}
