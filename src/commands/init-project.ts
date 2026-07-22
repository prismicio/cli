import { getAdapter } from "../adapters";
import { DEFAULT_PRISMIC_HOST } from "../env";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import { installDependencies, readPackageJson, removeDependencies } from "../lib/packageJson";
import { getCustomTypes, getSlices } from "../lib/prismic/clients/custom-types";
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
import { authenticateInit } from "./init-auth";
import { createRepo } from "./repo-create";

const config = {
	name: "prismic init",
	description: `
		Initialize a new Prismic project by creating a repository and
		prismic.config.json file. Detects the project framework, installs
		dependencies, and pulls models from Prismic.

		Use --repo to connect to an existing repository instead. If a
		slicemachine.config.json exists, its repository and settings will be
		migrated.
	`,
	sections: {
		SUBCOMMANDS: `
			instant  Instantly start a ready-to-run Prismic project
		`,
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository name" },
		lang: {
			type: "string",
			short: "l",
			description: "Master locale for a new repository (default: en-us)",
		},
		"no-browser": {
			type: "boolean",
			description: "Skip opening the browser automatically during login",
		},
		"no-setup": {
			type: "boolean",
			description: "Skip framework scaffolding (dependencies and framework files)",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo: explicitRepo, lang, "no-browser": noBrowser, "no-setup": noSetup } = values;

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

	const { host, token, profile } = await authenticateInit(noBrowser);

	let repo = (explicitRepo ?? legacySliceMachineConfig?.repositoryName)?.toLowerCase();
	if (repo) {
		const hasRepoAccess = profile.repositories.some((repository) => repository.domain === repo);
		if (!hasRepoAccess) {
			throw new CommandError(
				`Repository "${repo}" not found in your account. Check the name or request access to the repository.`,
			);
		}

		const isTypeBuilderEnabled = await checkIsTypeBuilderEnabled(repo, { token, host });
		if (!isTypeBuilderEnabled) {
			throw new TypeBuilderRequiredError(repo, host);
		}
	}

	const adapter = await getAdapter();

	if (!repo) {
		repo = await createRepo({ lang, token, host });
		console.info(`Created repository: ${repo}`);
	}

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
		// Slice Machine is replaced by the Type Builder and CLI, so its packages
		// are no longer needed after migrating.
		const { dependencies, devDependencies, peerDependencies } = await readPackageJson();
		const sliceMachinePackages = Object.keys({
			...dependencies,
			...devDependencies,
			...peerDependencies,
		}).filter((name) => name === "slice-machine-ui" || name.startsWith("@slicemachine/adapter-"));
		if (sliceMachinePackages.length > 0) {
			await removeDependencies(sliceMachinePackages);
		}
		console.info("Migrated slicemachine.config.json to prismic.config.json");
	}

	// Install dependencies and create framework files
	await adapter.initProject({ setup: !noSetup });

	// Run package manager install
	if (!noSetup) {
		try {
			console.info("Installing dependencies...");
			await installDependencies();
		} catch {
			console.warn(
				"Could not install dependencies automatically. Please install them manually (i.e. `npm install`).",
			);
		}
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
	console.info("Run `prismic pull` to pull models from Prismic.");
});
