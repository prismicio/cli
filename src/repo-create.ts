import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { isAuthenticated, authenticatedFetch, readHost } from "./lib/auth";
import { getRepoDashboardUrl } from "./lib/urls";

export async function repoCreate(): Promise<void> {
	const { values } = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "repo", "create"
		options: {
			help: { type: "boolean", short: "h" },
			name: { type: "string", short: "n" },
		},
	});

	if (values.help) {
		console.info(
			`
Usage: prismic repo create --name <name>

Create a new Prismic repository.
`.trim(),
		);

		return;
	}

	if (!values.name) {
		console.error("Missing required option: --name");
		process.exitCode = 1;
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		console.error("Not logged in. Run `prismic login` first.");
		process.exitCode = 1;
		return;
	}

	const domain = toDomain(values.name);

	try {
		await createRepository(domain);
		console.info(`Repository created: ${domain}`);
		console.info(`URL: ${await getRepoDashboardUrl(domain)}`);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to create repository: ${error.message}`);
		} else {
			console.error("Failed to create repository");
		}
		process.exitCode = 1;
	}
}

async function createRepository(domain: string): Promise<void> {
	const url = new URL("/app/dashboard/repositories", await readHost());
	const response = await authenticatedFetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			domain,
			framework: "next",
			plan: "personal",
			usageIntent: "Exploring Prismic's features for future projects.",
			usageIntentIndex: 0,
		}),
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`${response.status} ${response.statusText}: ${text}`);
	}
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
