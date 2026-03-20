import type { Profile } from "../clients/user";

import { getAdapter } from "../adapters";
import { createLoginSession, getHost, getToken } from "../auth";
import { getProfile } from "../clients/user";
import {
	createConfig,
	deleteLegacySliceMachineConfig,
	InvalidLegacySliceMachineConfig,
	readConfig,
	readLegacySliceMachineConfig,
	UnknownProjectRoot,
} from "../config";
import { openBrowser } from "../lib/browser";
import { generateAndWriteTypes } from "../lib/codegen";
import { parseCommand } from "../lib/command";
import { ForbiddenRequestError, UnauthorizedRequestError } from "../lib/request";
import { findProjectRoot } from "../project";
import { syncCustomTypes, syncSlices } from "./sync";

const HELP = `
Initialize a Prismic project by creating a prismic.config.json file.

Detects the project framework, installs dependencies, and syncs models
from Prismic. If a slicemachine.config.json exists, it will be migrated.

USAGE
  prismic init [flags]

FLAGS
  -r, --repo string   Repository name
      --no-browser     Skip opening the browser automatically during login
  -h, --help          Show help for command

EXAMPLES
  prismic init --repo my-repo

LEARN MORE
  Use \`prismic <command> --help\` for more information about a command.
`.trim();

export async function init(): Promise<void> {
	const {
		values: { repo: explicitRepo, "no-browser": noBrowser },
	} = parseCommand({
		help: HELP,
		argv: process.argv.slice(3),
		options: {
			repo: { type: "string", short: "r" },
			"no-browser": { type: "boolean" },
		},
	});

	// Check for existing prismic.config.json
	try {
		await readConfig();
		console.error("A prismic.config.json file exists. This project is already initialized.");
		process.exitCode = 1;
		return;
	} catch {}

	// Load legacy slicemachine.config.json
	let legacySliceMachineConfig;
	try {
		legacySliceMachineConfig = await readLegacySliceMachineConfig();
	} catch (error) {
		if (error instanceof InvalidLegacySliceMachineConfig) {
			console.warn("Could not read slicemachine.config.json, ignoring.");
		}
	}

	const repo = explicitRepo ?? legacySliceMachineConfig?.repositoryName;
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
					if (noBrowser) {
						console.info(`Open this URL to log in: ${url}`);
					} else {
						console.info("Opening browser to complete login...");
						console.info(`If the browser doesn't open, visit: ${url}`);
						openBrowser(url);
					}
				},
			});
			console.info(`Logged in as ${email}`);
			const token = await getToken();
			profile = await getProfile({ token, host });
		} else {
			throw error;
		}
	}

	const repoMeta = profile.repositories.find((repository) => repository.domain === repo);
	if (!repoMeta) {
		console.error(
			`Repository "${repo}" not found in your account. Check the name or request access to the repository.`,
		);
		process.exitCode = 1;
		return;
	}

	const adapter = await getAdapter();

	// Create prismic.config.json
	try {
		await createConfig({
			repositoryName: repo,
			libraries: legacySliceMachineConfig?.libraries,
		});
	} catch (error) {
		if (error instanceof UnknownProjectRoot) {
			console.error(
				"Could not find a package.json file. Run this command from a project directory.",
			);
		} else {
			console.error("Failed to create config file.");
		}
		process.exitCode = 1;
		return;
	}

	if (legacySliceMachineConfig) {
		try {
			await deleteLegacySliceMachineConfig();
		} catch {}
		console.info("Migrated slicemachine.config.json to prismic.config.json");
	}

	// Install dependencies and create framework files
	await adapter.initProject();

	// Sync models from remote
	await syncSlices(repo, adapter);
	await syncCustomTypes(repo, adapter);

	// Generate TypeScript types from synced models
	const slices = await adapter.getSlices();
	const customTypes = await adapter.getCustomTypes();
	const projectRoot = await findProjectRoot();
	await generateAndWriteTypes({
		customTypes: customTypes.map((customType) => customType.model),
		slices: slices.map((slice) => slice.model),
		projectRoot,
	});

	console.info(
		`Initialized Prismic for repository "${repo}". Run \`npm install\` to install new dependencies.`,
	);
}
