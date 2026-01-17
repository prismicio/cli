import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { getCredentials, getCookieValue, PRISMIC_BASE_URL } from "./lib/auth";

export async function repoCreate(): Promise<void> {
	const { values } = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "repo", "create"
		options: {
			help: { type: "boolean", short: "h" },
			name: { type: "string", short: "n" },
		},
	});

	if (values.help) {
		console.info("Usage: prismic repo create --name <name>\n\nCreate a new Prismic repository.");
		return;
	}

	if (!values.name) {
		console.error("Missing required option: --name");
		process.exitCode = 1;
		return;
	}

	const credentials = await getCredentials();

	if (!credentials) {
		console.error("Not logged in. Run `prismic login` first.");
		process.exitCode = 1;
		return;
	}

	const authToken = getCookieValue(credentials.cookies, "prismic-auth");
	if (!authToken) {
		console.error("Invalid credentials. Run `prismic login` first.");
		process.exitCode = 1;
		return;
	}

	const domain = toDomain(values.name);

	try {
		await createRepository(domain, credentials.cookies);
		console.info(`Repository created: ${domain}`);
		console.info(`URL: https://${domain}.prismic.io`);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to create repository: ${error.message}`);
		} else {
			console.error("Failed to create repository");
		}
		process.exitCode = 1;
	}
}

async function createRepository(domain: string, cookies: string[]): Promise<void> {
	const url = new URL("/app/dashboard/repositories", PRISMIC_BASE_URL);
	const cookieHeader = cookies.join("; ");

	const body = {
		domain,
		framework: "next",
		plan: "personal",
		usageIntent: "Exploring Prismic's features for future projects.",
		usageIntentIndex: 0,
	};

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Cookie: cookieHeader,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
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
