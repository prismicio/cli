import { exec } from "node:child_process";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl, getUserServiceUrl } from "./lib/url";

const HELP = `
View a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic repo view [flags]

FLAGS
  -r, --repo string   Repository domain
      --web           Open repository in browser
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

const ProfileSchema = v.object({
	repositories: v.array(
		v.object({
			domain: v.string(),
			name: v.optional(v.string()),
		}),
	),
});

export async function repoView(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig(), web },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "repo", "view"
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
			web: { type: "boolean" },
		},
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!repo) {
		console.error("Missing prismic.config.json or --repo option");
		process.exitCode = 1;
		return;
	}

	const repoUrl = await getRepoUrl(repo);

	if (web) {
		openInBrowser(repoUrl.toString());
		console.info(`Opening ${repoUrl}`);
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

	const response = await fetchProfile();
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to fetch repository info: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	const repoData = response.value.repositories.find((r) => r.domain === repo);
	if (!repoData) {
		console.error(`Repository not found: ${repo}`);
		process.exitCode = 1;
		return;
	}

	const name = repoData.name || "(no name)";
	console.info(`Name: ${name}`);
	console.info(`URL: ${repoUrl}`);
}

async function fetchProfile(): ReturnType<typeof request<v.InferOutput<typeof ProfileSchema>>> {
	const url = new URL("profile", await getUserServiceUrl());
	return await request(url, { schema: ProfileSchema });
}

function openInBrowser(url: string): void {
	const cmd =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";

	exec(`${cmd} "${url}"`);
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
