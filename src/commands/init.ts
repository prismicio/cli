import { rm } from "node:fs/promises";

import type { Profile } from "../lib/prismic/clients/user";

import { getAdapter, type Adapter } from "../adapters";
import { createLoginSession, getCredentials } from "../auth";
import { DEFAULT_PRISMIC_HOST, env } from "../env";
import { openBrowser } from "../lib/browser";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import {
	installDependencies,
	readPackageJson,
	removeDependencies,
	updatePackageJsonName,
} from "../lib/packageJson";
import {
	addPreview,
	getPreviews,
	removePreview,
	setSimulatorUrl,
} from "../lib/prismic/clients/core";
import { getCustomTypes, getSlices } from "../lib/prismic/clients/custom-types";
import { getRepository, type Repository } from "../lib/prismic/clients/repository";
import { getProfile } from "../lib/prismic/clients/user";
import { canonicalizeCustomType, canonicalizeSlice } from "../lib/prismic/models";
import { completeOnboardingSteps } from "../lib/prismic/onboarding";
import { ForbiddenRequestError, UnauthorizedRequestError } from "../lib/request";
import { sentryCaptureError } from "../lib/sentry";
import { dedent } from "../lib/string";
import {
	type Config,
	createConfig,
	deleteLegacySliceMachineConfig,
	findProjectRoot,
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
	`,
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

	let existingConfig: Config | undefined;
	try {
		existingConfig = await readConfig();
	} catch (error) {
		if (!(error instanceof MissingPrismicConfigError)) throw error;
	}
	if (existingConfig && !explicitRepo) {
		throw new CommandError(
			"A prismic.config.json file exists. Use `prismic init --repo <repository>` to connect it to an existing repository.",
		);
	}
	const isExistingProjectHandoff = existingConfig !== undefined && explicitRepo !== undefined;

	// Load legacy slicemachine.config.json
	let legacySliceMachineConfig;
	if (!existingConfig) {
		try {
			legacySliceMachineConfig = await readLegacySliceMachineConfig();
		} catch (error) {
			if (error instanceof InvalidLegacySliceMachineConfigError) {
				console.warn("Could not read slicemachine.config.json, ignoring.");
			}
		}
	}

	const { host, token: initialToken } = await getCredentials();
	let token = initialToken;
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
			const loggedIn = await getCredentials();
			token = loggedIn.token;
			profile = await getProfile({ token, host });
		} else {
			throw error;
		}
	}

	let repo = (explicitRepo ?? legacySliceMachineConfig?.repositoryName)?.toLowerCase();
	let connectedRepository: Repository | undefined;
	if (repo) {
		const hasRepoAccess = profile.repositories.some((repository) => repository.domain === repo);
		if (!hasRepoAccess) {
			throw new CommandError(
				`Repository "${repo}" not found in your account. Check the name or request access to the repository.`,
			);
		}

		const isTypeBuilderEnabled = await checkIsTypeBuilderEnabled(repo, {
			token,
			host,
		});
		if (!isTypeBuilderEnabled) {
			throw new TypeBuilderRequiredError(repo, host);
		}

		connectedRepository = await getRepository({ repo, token, host });
	}

	const adapter = await getAdapter();

	if (!repo) {
		repo = await createRepo({ lang, token, host });
		console.info(`Created repository: ${repo}`);
	}

	// Create or reconnect prismic.config.json
	try {
		const documentAPIEndpoint =
			host !== DEFAULT_PRISMIC_HOST ? `https://${repo}.cdn.${host}/api/v2/` : undefined;
		if (existingConfig) {
			await updateConfig({ repositoryName: repo, documentAPIEndpoint });
		} else {
			await createConfig({
				repositoryName: repo,
				documentAPIEndpoint,
				libraries: legacySliceMachineConfig?.libraries,
				routes: [],
			});
		}
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
	await adapter.initProject({ setup: !noSetup && !existingConfig });

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

	const sliceOps = diffArrays(remoteSlices, localSliceModels, {
		getKey: (model) => model.id,
		equals: (a, b) => JSON.stringify(canonicalizeSlice(a)) === JSON.stringify(canonicalizeSlice(b)),
	});

	const customTypeOps = diffArrays(remoteCustomTypes, localCustomTypeModels, {
		getKey: (model) => model.id,
		equals: (a, b) =>
			JSON.stringify(canonicalizeCustomType(a)) === JSON.stringify(canonicalizeCustomType(b)),
	});

	if (isExistingProjectHandoff && connectedRepository?.starter) {
		if (remoteCustomTypes.length === 0 && remoteSlices.length === 0) {
			throw new CommandError(
				`Repository "${repo}" has no starter models. Use a repository created from the starter in the Prismic dashboard.`,
			);
		}
		await cleanupStarterProject(connectedRepository.starter);
	}

	const hasStarterModelChanges =
		isExistingProjectHandoff &&
		[customTypeOps, sliceOps].some((ops) => ops.update.length > 0 || ops.delete.length > 0);

	if (!hasStarterModelChanges) {
		for (const slice of sliceOps.update) {
			await adapter.updateSlice(slice);
		}
		for (const slice of sliceOps.delete) {
			await adapter.deleteSlice(slice.id);
		}
		for (const slice of sliceOps.insert) {
			await adapter.createSlice(slice);
		}

		for (const customType of customTypeOps.update) {
			await adapter.updateCustomType(customType);
		}
		for (const customType of customTypeOps.delete) {
			await adapter.deleteCustomType(customType.id);
		}
		for (const customType of customTypeOps.insert) {
			await adapter.createCustomType(customType);
		}
	}

	await adapter.generateTypes();

	if (hasStarterModelChanges) {
		console.warn(
			dedent`
				Local and remote models differ, so no model files were changed. The project is connected.

				Choose the source of truth:
				  prismic pull --force   Adopt remote models
				  prismic push --force   Keep local models
			`,
		);
	}

	if (isExistingProjectHandoff && connectedRepository?.starter) {
		await completeStarterHandoff(adapter, connectedRepository.starter, {
			repo,
			token,
			host,
		});
		console.info("\n---");
		console.info("\nYour project is ready!");
		console.info("\nHere's what you can do next:");
		console.info("• Start the development server: `npm run dev`");
		console.info(`• Preview your pages live at https://${repo}.${host}/builder`);
		console.info("\nStart building 🚀");
	} else {
		console.info("\n---");
		console.info(`\nInitialized Prismic for repository "${repo}".`);
		console.info("Run `prismic type create <name>` to create a content type.");
		console.info("Run `prismic pull` to pull models from Prismic.");
	}
});

async function isStarterPackage(starter: NonNullable<Repository["starter"]>): Promise<boolean> {
	const packageJson = await readPackageJson();
	const starterPackageName = starter.id.split("/").at(-1);
	return Boolean(starterPackageName && packageJson.name === starterPackageName);
}

async function completeStarterHandoff(
	adapter: Adapter,
	starter: NonNullable<Repository["starter"]>,
	config: { repo: string; token: string | undefined; host: string },
): Promise<void> {
	try {
		const previews = await getPreviews(config);
		await Promise.all(
			previews
				.filter((preview) => preview.label === "Starter Preview")
				.map((preview) => removePreview(preview.id, config)),
		);
		const hasDevelopmentPreview = previews.some(
			(preview) => preview.url === adapter.localPreviewUrl,
		);
		if (!hasDevelopmentPreview) {
			await addPreview(adapter.localPreviewConfig, config);
		}
	} catch (error) {
		await sentryCaptureError(error);
		console.error(
			`Could not configure the local preview. Run \`prismic preview add ${adapter.localPreviewUrl} --name ${adapter.localPreviewConfig.name}\` manually. Continuing.`,
		);
	}

	try {
		await setSimulatorUrl(adapter.localSimulatorUrl, config);
	} catch (error) {
		await sentryCaptureError(error);
		console.error(
			`Could not configure the local slice simulator. Run \`prismic preview set-simulator ${adapter.localSimulatorUrl}\` manually. Continuing.`,
		);
	}

	await completeOnboardingSteps(["instantStart_continueBuildingLocally"], config).catch(() => {});

	if (await isStarterPackage(starter)) {
		await updatePackageJsonName(config.repo);
	}
}

async function cleanupStarterProject(starter: NonNullable<Repository["starter"]>): Promise<void> {
	if (!(await isStarterPackage(starter))) return;

	const projectRoot = await findProjectRoot();
	await Promise.all([
		rm(new URL(".deployment", projectRoot), { recursive: true, force: true }),
		rm(new URL("documents", projectRoot), { recursive: true, force: true }),
	]);
}
