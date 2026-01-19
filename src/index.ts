#!/usr/bin/env node

import { parseArgs } from "node:util";

import { locale } from "./locale";
import { login } from "./login";
import { logout } from "./logout";
import { repo } from "./repo";

const HELP = `
Usage: prismic <command>

Commands:
  login              Log in to Prismic
  logout             Log out of Prismic
  repo               Manage Prismic repositories
  locale             Manage locales in a repository

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
	case "repo":
		await repo();
		break;
	case "locale":
		await locale();
		break;
	default: {
		if (positionals[0]) {
			console.error(`Unknown command: ${positionals[0]}`);
			process.exitCode = 1;
		}
		console.info(HELP);
	}
}
