import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl, getUserServiceUrl } from "./lib/url";

const HELP = `
List all Prismic repositories.

USAGE
  prismic repo list [flags]

FLAGS
      --json     Output as JSON
  -h, --help     Show help for command

LEARN MORE
  Use \`prismic repo <command> --help\` for more information about a command.
`.trim();

const ProfileSchema = v.object({
	repositories: v.array(
		v.object({
			domain: v.string(),
			name: v.optional(v.string()),
			role: v.string(),
		}),
	),
});

export async function repoList(): Promise<void> {
	const {
		values: { help, json },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "repo", "list"
		options: {
			help: { type: "boolean", short: "h" },
			json: { type: "boolean" },
		},
	});

	if (help) {
		console.info(HELP);
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
			console.error(`Failed to fetch repositories: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	const repos = response.value.repositories;

	if (json) {
		const output = await Promise.all(
			repos.map(async (repo) => ({
				domain: repo.domain,
				name: repo.name || null,
				role: repo.role,
				url: (await getRepoUrl(repo.domain)).toString(),
			})),
		);
		console.info(stringify(output));
		return;
	}

	if (repos.length === 0) {
		console.info("No repositories found.");
		return;
	}

	for (const repo of repos) {
		const name = repo.name || "(no name)";
		console.info(`${repo.domain}  ${name}  ${repo.role}`);
	}
}

async function fetchProfile(): ReturnType<typeof request<v.InferOutput<typeof ProfileSchema>>> {
	const url = new URL("profile", await getUserServiceUrl());
	return await request(url, { schema: ProfileSchema });
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
