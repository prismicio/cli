import { readFile, rm } from "node:fs/promises";
import { parseArgs } from "node:util";

import type { Profile } from "./clients/user";
import type { FrameworkAdapter } from "./framework";
import type { Config } from "./lib/config";

import { getProfile } from "./clients/user";
import { NoSupportedFrameworkError, requireFramework } from "./framework";
import { createLoginSession, getHost, getToken } from "./lib/auth";
import { openBrowser } from "./lib/browser";
import { createConfig, readConfig, UnknownProjectRoot } from "./lib/config";
import { findUpward } from "./lib/file";
import { ForbiddenRequestError, UnauthorizedRequestError } from "./lib/request";
import { syncCustomTypes, syncSlices } from "./sync";

const HELP = `
Initialize a Prismic project by creating a prismic.config.json file.

Detects the project framework, installs dependencies, and syncs models
from Prismic. If a slicemachine.config.json exists, it will be migrated.

USAGE
  prismic init [flags]

FLAGS
  -r, --repo string   Repository name
  -h, --help          Show help for command

EXAMPLES
  prismic init --repo my-repo

LEARN MORE
  Use \`prismic <command> --help\` for more information about a command.
`.trim();

export async function init(): Promise<void> {
	const { values } = parseArgs({
		args: process.argv.slice(3),
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
		},
	});

	if (values.help) {
		console.info(HELP);
		return;
	}

	// Check for existing prismic.config.json
	const existingConfig = await readConfig();
	if (existingConfig.ok) {
		console.error("A prismic.config.json file already exists.");
		process.exitCode = 1;
		return;
	}

	// Check for legacy slicemachine.config.json
	const legacyConfigPath = await findUpward("slicemachine.config.json", {
		stop: "package.json",
	});
	let legacyRepoName: string | undefined;
	let legacyLibraries: string[] | undefined;

	if (legacyConfigPath) {
		try {
			const contents = await readFile(legacyConfigPath, "utf8");
			const legacyConfig = JSON.parse(contents);
			legacyRepoName = legacyConfig.repositoryName;
			legacyLibraries = legacyConfig.libraries;
		} catch {
			console.warn("Could not read slicemachine.config.json, ignoring.");
		}
	}

	// Determine repo name: --repo flag > legacy config > error
	const repo = values.repo ?? legacyRepoName;
	if (!repo) {
		console.error("Missing required flag: --repo");
		process.exitCode = 1;
		return;
	}

	// Validate repo membership
	const token = await getToken();
	const host = await getHost();
	let profile: Profile;
	try {
		profile = await getProfile({ token, host });
	} catch (error) {
		if (error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError) {
			console.info("Not logged in. Starting login...");
			const { email } = await createLoginSession({
				onReady: (url) => {
					console.info("Opening browser to complete login...");
					console.info(`If the browser doesn't open, visit: ${url}`);
					openBrowser(url);
				},
			});
			console.info(`Logged in as ${email}`);
		}
		throw error;
	}

	const repoMeta = profile.repositories.find((repository) => repository.domain === repo);
	if (!repoMeta) {
		console.error(
			`Repository "${repo}" not found in your account. Check the name or create it with \`prismic repo create\`.`,
		);
		process.exitCode = 1;
		return;
	}

	let framework: FrameworkAdapter;
	try {
		framework = await requireFramework();
	} catch (error) {
		if (error instanceof NoSupportedFrameworkError) {
			console.error(error.message);
			process.exitCode = 1;
			return;
		}
		throw error;
	}

	// Create prismic.config.json
	const configData: Config = { repositoryName: repo };
	if (legacyLibraries?.length) {
		configData.libraries = legacyLibraries;
	}

	const configResult = await createConfig(configData);
	if (!configResult.ok) {
		if (configResult.error instanceof UnknownProjectRoot) {
			console.error(
				"Could not find a package.json file. Run this command from a project directory.",
			);
		} else {
			console.error("Failed to create config file.");
		}
		process.exitCode = 1;
		return;
	}

	// Delete legacy config after new config is created
	if (legacyConfigPath) {
		await rm(legacyConfigPath);
		console.info("Migrated slicemachine.config.json to prismic.config.json");
	}

	// Install dependencies and create framework files
	await framework.initProject();

	// Sync models from remote
	await syncSlices(repo, framework);
	await syncCustomTypes(repo, framework);

	console.info(
		`Initialized Prismic for repository "${repo}". Run \`npm install\` to install new dependencies.`,
	);
}
