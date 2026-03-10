import { parseArgs } from "node:util";

import { getClientSetupAnchor, getDocsPath, getFramework } from "./framework";
import { isAuthenticated, getHost } from "./lib/auth";
import { createConfig, readConfig, updateConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request } from "./lib/request";
import { getRepoUrl } from "./lib/url";

const HELP = `
Create a new Prismic repository.

Creates prismic.config.json in the current directory. If a config file already
exists, use --replace to update it with the new repository.

USAGE
  prismic repo create <domain> [flags]

ARGUMENTS
  domain   Repository domain (required). Must be at least 4 characters,
           start and end with alphanumeric, and contain only alphanumerics and hyphens.

FLAGS
  -n, --name string   Display name for the repository (defaults to domain)
      --no-config     Skip creating or updating prismic.config.json
      --replace       Replace existing repositoryName in prismic.config.json
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic repo <command> --help\` for more information about a command.
`.trim();

const DOMAIN_REGEX = /^[a-zA-Z0-9][-a-zA-Z0-9]{2,}[a-zA-Z0-9]$/;

export async function repoCreate(): Promise<void> {
	const {
		values: { help, name, "no-config": noConfig, replace },
		positionals: [domain],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "repo", "create"
		options: {
			help: { type: "boolean", short: "h" },
			name: { type: "string", short: "n" },
			"no-config": { type: "boolean" },
			replace: { type: "boolean" },
		},
		allowPositionals: true,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!domain) {
		console.error("Missing required argument: domain");
		process.exitCode = 1;
		return;
	}

	if (!DOMAIN_REGEX.test(domain)) {
		console.error("Invalid domain format.");
		console.error(
			"Must be at least 4 characters, start and end with alphanumeric, and contain only alphanumerics and hyphens.",
		);
		process.exitCode = 1;
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

	// Check existing config before repo creation (unless --no-config)
	const existingConfig = await readConfig();
	if (!noConfig && existingConfig.ok && !replace) {
		console.error(`This project already has a repository: ${existingConfig.config.repositoryName}`);
		console.error("Use --replace to replace it, or --no-config to skip config creation.");
		process.exitCode = 1;
		return;
	}

	// Check if domain is available
	const available = await checkDomainAvailable(domain);
	if (!available.ok) {
		if (available.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to check domain availability: ${stringify(available.error)}`);
			process.exitCode = 1;
		}
		return;
	}
	if (!available.value) {
		console.error(`Repository name "${domain}" is already taken.`);
		process.exitCode = 1;
		return;
	}

	const response = await createRepository(domain, name);
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error(`Failed to create repository: ${stringify(response.error)}`);
			process.exitCode = 1;
		}
		return;
	}

	// Create or update config after successful repo creation
	if (!noConfig) {
		if (existingConfig.ok) {
			const result = await updateConfig({ repositoryName: domain });
			if (result.ok) {
				console.info("Updated prismic.config.json");
			} else {
				console.warn("Could not update prismic.config.json: " + result.error.message);
			}
		} else {
			const result = await createConfig({ repositoryName: domain });
			if (result.ok) {
				console.info("Created prismic.config.json");
			} else {
				console.warn("Could not create prismic.config.json: " + result.error.message);
			}
		}
	}

	console.info(`Repository created: ${domain}`);
	console.info(`URL: ${await getRepoUrl(domain)}`);

	// Print framework-specific next steps
	const framework = await getFramework();
	if (framework) {
		const docsPath = getDocsPath(framework.id);
		const anchor = getClientSetupAnchor(framework.id);
		const clientFile = await framework.getClientFilePath();
		const fileDesc = clientFile ? `creating ${clientFile}` : "configuring Prismic";
		console.info();
		console.info(
			`Next: Run \`prismic docs fetch ${docsPath}${anchor}\` for instructions on ${fileDesc}`,
		);
	}
}

async function checkDomainAvailable(domain: string) {
	const url = new URL(`/app/dashboard/repositories/${domain}/exists`, await getHost());
	const response = await request<string>(url);
	if (!response.ok) {
		return response;
	}
	// Endpoint returns "false" when repository exists, "true" when available
	return { ok: true as const, value: response.value === "true" };
}

async function createRepository(domain: string, name = domain) {
	const url = new URL("/app/dashboard/repositories", await getHost());
	return await request(url, {
		method: "POST",
		body: {
			domain,
			name,
			framework: "next",
			plan: "personal",
			usageIntent: "Exploring Prismic's features for future projects.",
			usageIntentIndex: 0,
		},
	});
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
