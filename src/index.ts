#!/usr/bin/env node

import { parseArgs } from "node:util";

import { locale } from "./locale";
import { login } from "./login";
import { logout } from "./logout";
import { preview } from "./preview";
import { repo } from "./repo";
import { token } from "./token";
import { webhook } from "./webhook";
import { whoami } from "./whoami";

const HELP = `
Prismic CLI for managing repositories and configurations.

USAGE
  prismic <command> [flags]

COMMANDS
  login     Log in to Prismic
  logout    Log out of Prismic
  whoami    Show the currently logged in user
  repo      Manage Prismic repositories
  locale    Manage locales in a repository
  preview   Manage preview configurations
  token     Manage API tokens in a repository
  webhook   Manage webhooks in a repository

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic <command> --help\` for more information about a command.
`.trim();

const { positionals } = parseArgs({
	options: { help: { type: "boolean", short: "h" } },
	allowPositionals: true,
	strict: false,
});

switch (positionals[0]) {
	case "login":
		await login();
		break;
	case "logout":
		await logout();
		break;
	case "whoami":
		await whoami();
		break;
	case "repo":
		await repo();
		break;
	case "locale":
		await locale();
		break;
	case "preview":
		await preview();
		break;
	case "token":
		await token();
		break;
	case "webhook":
		await webhook();
		break;
	default: {
		if (positionals[0]) {
			console.error(`Unknown command: ${positionals[0]}`);
			process.exitCode = 1;
		}
		console.info(HELP);
	}
}
