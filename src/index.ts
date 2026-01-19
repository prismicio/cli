#!/usr/bin/env node

import { parseArgs } from "node:util";

import { locale } from "./locale";
import { login } from "./login";
import { logout } from "./logout";
import { preview } from "./preview";
import { repo } from "./repo";
import { whoami } from "./whoami";

const HELP = `
Usage: prismic <command>

Commands:
  login              Log in to Prismic
  logout             Log out of Prismic
  whoami             Show the currently logged in user
  repo               Manage Prismic repositories
  locale             Manage locales in a repository
  preview            Manage preview configurations

Options:
  -h, --help   Show this help message
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
	default: {
		if (positionals[0]) {
			console.error(`Unknown command: ${positionals[0]}`);
			process.exitCode = 1;
		}
		console.info(HELP);
	}
}
