import type { Profile } from "../clients/user";

import { getAdapter } from "../adapters";
import { createLoginSession, getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { getProfile } from "../clients/user";
import { checkIsDomainAvailable } from "../clients/wroom";
import { DEFAULT_PRISMIC_HOST } from "../env";
import { openBrowser } from "../lib/browser";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import { installDependencies } from "../lib/packageJson";
import { ForbiddenRequestError, UnauthorizedRequestError } from "../lib/request";
import {
	createConfig,
	deleteLegacySliceMachineConfig,
	InvalidLegacySliceMachineConfigError,
	MissingPrismicConfigError,
	readConfig,
	readLegacySliceMachineConfig,
	UnknownProjectRootError,
} from "../project";
import { checkIsTypeBuilderEnabled, TypeBuilderRequiredError } from "../project";
import { createRepo, repositoryNameSchema } from "./repo-create";

const config = {
	name: "prismic init",
	description: `
		Initialize a new Prismic project by creating a repository and
		prismic.config.json file. Detects the project framework, installs
		dependencies, and syncs models from Prismic.

		Use --repo to connect to an existing repository instead. If a
		slicemachine.config.json exists, its repository and settings will be
		migrated.
	`,
	options: {
		repo: { type: "string", short: "r", description: "Repository name (created if it doesn't exist)" },
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
		if (error instanceof MissingPrismicConfigError) {
			// No config found — proceed with initialization.
		} else {
			throw error;
		}
	}

	// Load legacy slicemachine.config.json
	let legacySliceMachineConfig;
	try {
		legacySliceMachineConfig = await readLegacySliceMachineConfig();
	} catch (error) {
		if (error instanceof InvalidLegacySliceMachineConfigError) {
			console.warn("Could not read slicemachine.config.json, ignoring.");
		}
	}

	let token = await getToken();
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
			token = await getToken();
			profile = await getProfile({ token, host });
		} else {
			throw error;
		}
	}

	let repo = (explicitRepo ?? legacySliceMachineConfig?.repositoryName)?.toLowerCase();
	if (!repo) {
		throw new CommandError(
			"Missing --repo. Provide the repository to connect to (or to create if it doesn't exist).",
		);
	}

	const hasRepoAccess = profile.repositories.some((repository) => repository.domain === repo);
	if (!hasRepoAccess) {
		const parsed = repositoryNameSchema.safeParse(repo);
		if (!parsed.success) {
			throw new CommandError(
				`Invalid repository name "${repo}": ${parsed.error.issues[0]?.message ?? "Invalid value"}`,
			);
		}

		console.info(
			`Repository "${repo}" was not found in your account. Creating it...`,
		);
		const available = await checkIsDomainAvailable({ domain: repo, token, host });
		if (!available) {
			throw new CommandError(
				`Repository name "${repo}" is already taken. Choose a different name.`,
			);
		}

		repo = await createRepo({ name: repo, token, host });
		console.info(`Created repository: ${repo}`);
	} else {
		const isTypeBuilderEnabled = await checkIsTypeBuilderEnabled(repo, { token, host });
		if (!isTypeBuilderEnabled) {
			throw new TypeBuilderRequiredError();
		}
	}
	
	const adapter = await getAdapter();

	// Create prismic.config.json
	try {
		const documentAPIEndpoint =
			host !== DEFAULT_PRISMIC_HOST ? `https://${repo}.cdn.${host}/api/v2/` : undefined;
		await createConfig({
			repositoryName: repo,
			documentAPIEndpoint,
			libraries: legacySliceMachineConfig?.libraries,
			routes: [],
		});
	} catch (error) {
		if (error instanceof UnknownProjectRootError) {
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

	// Run package manager install
	try {
		console.info("Installing dependencies...");
		await installDependencies();
	} catch {
		console.warn(
			"Could not install dependencies automatically. Please install them manually (i.e. `npm install`).",
		);
	}

	// Sync models from remote and generate types
	const [remoteCustomTypes, remoteSlices, localCustomTypes, localSlices] = await Promise.all([
		getCustomTypes({ repo, token, host }),
		getSlices({ repo, token, host }),
		adapter.getCustomTypes(),
		adapter.getSlices(),
	]);
	const localCustomTypeModels = localCustomTypes.map((c) => c.model);
	const localSliceModels = localSlices.map((s) => s.model);

	const sliceOps = diffArrays(remoteSlices, localSliceModels, { getKey: (m) => m.id });
	for (const slice of sliceOps.update) {
		await adapter.updateSlice(slice);
	}
	for (const slice of sliceOps.delete) {
		await adapter.deleteSlice(slice.id);
	}
	for (const slice of sliceOps.insert) {
		await adapter.createSlice(slice);
	}

	const customTypeOps = diffArrays(remoteCustomTypes, localCustomTypeModels, {
		getKey: (m) => m.id,
	});
	for (const customType of customTypeOps.update) {
		await adapter.updateCustomType(customType);
	}
	for (const customType of customTypeOps.delete) {
		await adapter.deleteCustomType(customType.id);
	}
	for (const customType of customTypeOps.insert) {
		await adapter.createCustomType(customType);
	}

	await adapter.generateTypes();

	console.info(`\nInitialized Prismic for repository "${repo}".`);
	console.info("Run `prismic type create <name>` to create a content type.");
	console.info("Run `prismic sync` to sync models from Prismic.");
});
