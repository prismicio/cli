import type { Profile } from "../clients/user";

import { getAdapter } from "../adapters";
import { createLoginSession, getHost, getToken } from "../auth";
import {
	getCustomTypes,
	getSlices,
	insertCustomType,
	insertSlice,
} from "../clients/custom-types";
import { getProfile } from "../clients/user";
import { DEFAULT_PRISMIC_HOST, env } from "../env";
import { openBrowser } from "../lib/browser";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import { installDependencies, readPackageJson, removeDependencies } from "../lib/packageJson";
import { ForbiddenRequestError, UnauthorizedRequestError } from "../lib/request";
import {
	createConfig,
	deleteLegacySliceMachineConfig,
	InvalidLegacySliceMachineConfigError,
	MissingPrismicConfigError,
	readConfig,
	readLegacySliceMachineConfig,
	UnknownProjectRootError,
	updateConfig,
} from "../project";
import { checkIsTypeBuilderEnabled, TypeBuilderRequiredError } from "../project";
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

		Use --new to create an empty repository and push the project's local
		models to it, instead of pulling. Useful for starting from a template.
	`,
	options: {
		repo: { type: "string", short: "r", description: "Repository name" },
		new: {
			type: "boolean",
			description: "Create a new repository and push local models to it",
		},
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
	const {
		repo: explicitRepo,
		lang,
		"no-browser": noBrowser,
		"no-setup": noSetup,
		new: isNew,
	} = values;

	if (isNew && explicitRepo) {
		throw new CommandError(
			"`--new` creates a new repository and cannot be combined with `--repo`.",
		);
	}

	// `--new` repoints an existing config (e.g. a starter's) at a new
	// repository, so a config is allowed with `--new`. Otherwise, a config
	// means the project is already initialized.
	let hasConfig = false;
	try {
		await readConfig();
		hasConfig = true;
	} catch (error) {
		if (!(error instanceof MissingPrismicConfigError)) {
			throw error;
		}
	}
	if (hasConfig && !isNew) {
		throw new CommandError(
			"A prismic.config.json file exists. This project is already initialized.",
		);
	}

	let token = await getToken();
	const host = await getHost();
	let profile: Profile;
	try {
		profile = await getProfile({ token, host });
	} catch (error) {
		if (error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError) {
			if (env.PRISMIC_TOKEN) {
				throw new CommandError(
					"PRISMIC_TOKEN is invalid or expired. Unset it to log in with a browser, or replace it with a valid token.",
				);
			}
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

	const adapter = await getAdapter();

	// `prismic init --new`: create a new empty repository and push the project's
	// local models to it. `--new` always creates a new repository and pushes —
	// it never connects to an existing repository or pulls, so it can't delete
	// local models. An existing config (a starter's) is repointed at the new
	// repository; otherwise a fresh config is created.
	if (isNew) {
		const repo = await createRepo({ lang, token, host });
		console.info(`Created repository: ${repo}`);

		const documentAPIEndpoint =
			host !== DEFAULT_PRISMIC_HOST ? `https://${repo}.cdn.${host}/api/v2/` : undefined;

		// Without a config, create one first so the adapter and project setup can
		// resolve the project. With a config (a starter), it is repointed after
		// the push so a failed push doesn't leave the config switched.
		if (!hasConfig) {
			try {
				await createConfig({ repositoryName: repo, documentAPIEndpoint, routes: [] });
			} catch (error) {
				if (error instanceof UnknownProjectRootError) {
					throw new CommandError(
						"Could not find a package.json file. Run this command from a project directory.",
					);
				}
				throw new CommandError("Failed to create prismic.config.json.");
			}
		}

		const [localCustomTypes, localSlices] = await Promise.all([
			adapter.getCustomTypes(),
			adapter.getSlices(),
		]);
		for (const slice of localSlices) {
			await insertSlice(slice.model, { repo, token, host });
		}
		for (const customType of localCustomTypes) {
			await insertCustomType(customType.model, { repo, token, host });
		}

		if (hasConfig) {
			await updateConfig(
				documentAPIEndpoint
					? { repositoryName: repo, documentAPIEndpoint }
					: { repositoryName: repo },
			);
		}

		// Configure the project: regenerate the slice index and set the slice
		// simulator and a preview on the new repository. Scaffold framework files
		// only when the project doesn't already have them (i.e. there was no
		// config).
		await adapter.initProject({ setup: !noSetup && !hasConfig });
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

		await adapter.generateTypes();

		console.info(`\nInitialized Prismic for new repository "${repo}".`);
		console.info(`Pushed ${localCustomTypes.length} type(s), ${localSlices.length} slice(s).`);
		return;
	}

	// Default flow: create a new repository (or connect to one with --repo) and
	// pull its models.

	// Load legacy slicemachine.config.json
	let legacySliceMachineConfig;
	try {
		legacySliceMachineConfig = await readLegacySliceMachineConfig();
	} catch (error) {
		if (error instanceof InvalidLegacySliceMachineConfigError) {
			console.warn("Could not read slicemachine.config.json, ignoring.");
		}
	}

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
			throw new TypeBuilderRequiredError();
		}
	}

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
