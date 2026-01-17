#!/usr/bin/env node

import { parseArgs } from "node:util";

import { localeAdd } from "./locale-add";
import { localeList } from "./locale-list";
import { localeRemove } from "./locale-remove";
import { localeSetDefault } from "./locale-set-default";
import { login } from "./login";
import { logout } from "./logout";
import { repoCreate } from "./repo-create";

const { values, positionals } = parseArgs({
	options: { help: { type: "boolean", short: "h" } },
	allowPositionals: true,
	strict: false,
});

if (positionals[0] === "login") {
	await login();
} else if (positionals[0] === "logout") {
	await logout();
} else if (positionals[0] === "repo" && positionals[1] === "create") {
	await repoCreate();
} else if (positionals[0] === "locale" && positionals[1] === "add") {
	await localeAdd();
} else if (positionals[0] === "locale" && positionals[1] === "list") {
	await localeList();
} else if (positionals[0] === "locale" && positionals[1] === "set-default") {
	await localeSetDefault();
} else if (positionals[0] === "locale" && positionals[1] === "remove") {
	await localeRemove();
} else if (values.help || positionals.length === 0) {
	printHelp();
} else {
	console.error(`Unknown command: ${positionals[0]}`);
	process.exitCode = 1;
}

function printHelp() {
	console.info(
		`
Usage: prismic <command>

Commands:
  login              Log in to Prismic
  logout             Log out of Prismic
  repo create        Create a new Prismic repository
  locale add         Add a locale to a repository
  locale list        List locales in a repository
  locale remove      Remove a locale from a repository
  locale set-default Set the default locale for a repository

Options:
  -h, --help   Show this help message
`.trim(),
	);
}
