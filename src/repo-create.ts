import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { isAuthenticated, readHost } from "./lib/auth";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

const HELP = `
Create a new Prismic repository.

USAGE
  prismic repo create [flags]

FLAGS
  -n, --name string   Repository name (required)
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic repo <command> --help\` for more information about a command.
`.trim();

export async function repoCreate(): Promise<void> {
	const { values } = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "repo", "create"
		options: {
			help: { type: "boolean", short: "h" },
			name: { type: "string", short: "n" },
		},
	});

	if (values.help) {
		console.info(HELP);
		return;
	}

	if (!values.name) {
		console.error("Missing required option: --name");
		process.exitCode = 1;
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

	const domain = toDomain(values.name);

	const response = await createRepository(domain);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to create repository: ${stringify(response.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	console.info(`Repository created: ${domain}`);
	console.info(`URL: ${await getRepoUrl(domain)}`);
}

async function createRepository(domain: string) {
	const url = new URL("/app/dashboard/repositories", await readHost());
	return await request(url, {
		method: "POST",
		body: {
			domain,
			framework: "next",
			plan: "personal",
			usageIntent: "Exploring Prismic's features for future projects.",
			usageIntentIndex: 0,
		},
	});
}

function toDomain(name: string): string {
	const kebab = toKebabCase(name);
	const suffix = randomBytes(4).toString("hex");
	return `${kebab}-${suffix}`;
}

function toKebabCase(str: string): string {
	return str
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
