#!/usr/bin/env node

import { parseArgs } from "node:util";

import packageJson from "../package.json" with { type: "json" };
import { codegen } from "./codegen";
import { customType } from "./custom-type";
import { docs } from "./docs";
import { init } from "./init";
import { locale } from "./locale";
import { login } from "./login";
import { logout } from "./logout";
import { pageType } from "./page-type";
import { preview } from "./preview";
import { pull } from "./pull";
import { push } from "./push";
import { repo } from "./repo";
import { slice } from "./slice";
import { skill } from "./skill";
import { status } from "./status";
import { token } from "./token";
import { webhook } from "./webhook";
import { whoami } from "./whoami";

const HELP = `
Prismic CLI for managing repositories and configurations.

USAGE
  prismic <command> [flags]

COMMANDS
  init        Initialize a Prismic project
  login       Log in to Prismic
  logout      Log out of Prismic
  whoami      Show the currently logged in user
  status      Show the status of the current project
  repo        Manage Prismic repositories
  locale      Manage locales in a repository
  page-type   Manage page types in a repository
  custom-type Manage custom types in a repository
  slice       Manage slices in a project
  pull        Pull types and slices from Prismic
  push        Push types and slices to Prismic
  codegen     Generate code from Prismic models
  docs        Fetch and list documentation from Prismic
  skill       Manage Prismic AI skills
  preview     Manage preview configurations
  token       Manage API tokens in a repository
  webhook     Manage webhooks in a repository

FLAGS
  -v, --version  Show CLI version
  -h, --help     Show help for command

LEARN MORE
  Use \`prismic <command> --help\` for more information about a command.
`.trim();

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

if (version) {
	console.info(packageJson.version);
} else {
	switch (positionals[0]) {
		case "init":
			await init();
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
		case "status":
			await status();
			break;
		case "repo":
			await repo();
			break;
		case "locale":
			await locale();
			break;
		case "page-type":
			await pageType();
			break;
		case "custom-type":
			await customType();
			break;
		case "slice":
			await slice();
			break;
		case "pull":
			await pull();
			break;
		case "push":
			await push();
			break;
		case "codegen":
			await codegen();
			break;
		case "docs":
			await docs();
			break;
		case "skill":
			await skill();
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
}
