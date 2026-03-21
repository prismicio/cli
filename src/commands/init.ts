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
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { ForbiddenRequestError, UnauthorizedRequestError } from "../lib/request";
import { findProjectRoot } from "../project";
import { syncCustomTypes, syncSlices } from "./sync";

const config = {
	name: "prismic init",
	description: `
		Initialize a Prismic project by creating a prismic.config.json file.

		Detects the project framework, installs dependencies, and syncs models
		from Prismic. If a slicemachine.config.json exists, it will be migrated.
	`,
	options: {
		repo: { type: "string", short: "r", description: "Repository name" },
		"no-browser": {
			type: "boolean",
			description: "Skip opening the browser automatically during login",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo: explicitRepo, "no-browser": noBrowser } = values;

	// Check for existing prismic.config.json
	try {
		await readConfig();
		throw new CommandError(
			"A prismic.config.json file exists. This project is already initialized.",
		);
	} catch (error) {
		if (error instanceof CommandError) {
			throw error;
		}
	}

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
		throw new CommandError("Missing required flag: --repo");
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
		throw new CommandError(
			`Repository "${repo}" not found in your account. Check the name or request access to the repository.`,
		);
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
			throw new CommandError(
				"Could not find a package.json file. Run this command from a project directory.",
			);
		}
		throw new CommandError("Failed to create prismic.config.json.");
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
});
