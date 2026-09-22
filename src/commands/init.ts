import { rm } from "node:fs/promises";

import { FRAMEWORKS, getAdapter, NoSupportedFrameworkError } from "../adapters";
import { createLoginSession, getCredentials } from "../auth";
import { DEFAULT_PRISMIC_HOST, env } from "../env";
import { openBrowser } from "../lib/browser";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { diffArrays } from "../lib/diff";
import {
	installDependencies,
	MissingPackageJson,
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
import { getRepository } from "../lib/prismic/clients/repository";
import { getProfile } from "../lib/prismic/clients/user";
import { canonicalizeCustomType, canonicalizeSlice } from "../lib/prismic/models";
import { completeOnboardingSteps } from "../lib/prismic/onboarding";
import { ForbiddenRequestError, UnauthorizedRequestError } from "../lib/request";
import { sentryCaptureError } from "../lib/sentry";
import { dedent } from "../lib/string";
import {
	checkIsTypeBuilderEnabled,
	createConfig,
	deleteLegacySliceMachineConfig,
	findProjectRoot,
	InvalidLegacySliceMachineConfigError,
	MissingPrismicConfigError,
	readConfig,
	readLegacySliceMachineConfig,
	TypeBuilderRequiredError,
	UnknownProjectRootError,
	updateConfig,
} from "../project";
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

		Run \`prismic docs view cli#set-up-a-type-builder-project\` for details.
	`,
	options: {
		repo: {
			type: "string",
			short: "r",
			description: "Domain of an existing repository to connect to",
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
	const { repo: explicitRepo, lang, "no-browser": noBrowser, "no-setup": noSetup } = values;

	// An existing config is only allowed with --repo, which makes this a
	// reconnect of an existing project.
	let hasConfig = true;
	try {
		await readConfig();
	} catch (error) {
		if (!(error instanceof MissingPrismicConfigError)) throw error;
		hasConfig = false;
	}
	if (hasConfig && !explicitRepo) {
		throw new CommandError(
			"A prismic.config.json file exists. Use `prismic init --repo <repository>` to connect it to an existing repository.",
		);
	}

	let legacyConfig;
	if (!hasConfig) {
		try {
			legacyConfig = await readLegacySliceMachineConfig();
		} catch (error) {
			if (error instanceof InvalidLegacySliceMachineConfigError) {
				console.warn("Could not read slicemachine.config.json, ignoring.");
			}
		}
	}

	const credentials = await getCredentials();
	const { host } = credentials;
	let { token } = credentials;
	let profile;
	try {
		profile = await getProfile({ token, host });
	} catch (error) {
		if (!(error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError)) {
			throw error;
		}
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
		token = (await getCredentials()).token;
		profile = await getProfile({ token, host });
	}

	let repo = (explicitRepo ?? legacyConfig?.repositoryName)?.toLowerCase();
	let starter;
	if (repo) {
		if (!profile.repositories.some((repository) => repository.domain === repo)) {
			throw new CommandError(
				`Repository "${repo}" not found in your account. Check the name or request access to the repository.`,
			);
		}
		if (!(await checkIsTypeBuilderEnabled(repo, { token, host }))) {
			throw new TypeBuilderRequiredError(repo);
		}
		const repository = await getRepository({ repo, token, host });
		if (hasConfig) starter = repository.starter;
	}

	const adapter = await getAdapter().catch((error) => {
		if (!(error instanceof NoSupportedFrameworkError || error instanceof MissingPackageJson)) {
			throw error;
		}
		throw new CommandError(`
			No supported framework found. \`prismic init\` needs a Next.js, Nuxt, or SvelteKit project.

			Do one of the following:
			  - Run this command inside an existing Next.js, Nuxt, or SvelteKit project.
			  - Create the project first, then run \`prismic init\` again.
			  - To create the repository now, run \`prismic repo create --framework <${FRAMEWORKS.join("|")}>\`.
			    Connect the project later with \`prismic init --repo <domain>\`.
		`);
	});

	if (!repo) {
		repo = await createRepo({ lang, framework: adapter.id, token, host });
		console.info(`Created repository: ${repo}`);
	}

	try {
		const documentAPIEndpoint =
			host !== DEFAULT_PRISMIC_HOST ? `https://${repo}.cdn.${host}/api/v2/` : undefined;
		if (hasConfig) {
			await updateConfig({ repositoryName: repo, documentAPIEndpoint });
		} else {
			await createConfig({
				repositoryName: repo,
				documentAPIEndpoint,
				libraries: legacyConfig?.libraries,
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

	if (legacyConfig) {
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

	const [remoteCustomTypes, remoteSlices, localCustomTypes, localSlices] = await Promise.all([
		getCustomTypes({ repo, token, host }),
		getSlices({ repo, token, host }),
		adapter.getCustomTypes(),
		adapter.getSlices(),
	]);
	const sliceOps = diffArrays(
		remoteSlices,
		localSlices.map((slice) => slice.model),
		{
			getKey: (model) => model.id,
			equals: (a, b) =>
				JSON.stringify(canonicalizeSlice(a)) === JSON.stringify(canonicalizeSlice(b)),
		},
	);
	const customTypeOps = diffArrays(
		remoteCustomTypes,
		localCustomTypes.map((customType) => customType.model),
		{
			getKey: (model) => model.id,
			equals: (a, b) =>
				JSON.stringify(canonicalizeCustomType(a)) === JSON.stringify(canonicalizeCustomType(b)),
		},
	);

	let isStarterPackage = false;
	if (starter) {
		if (remoteCustomTypes.length === 0 && remoteSlices.length === 0) {
			throw new CommandError(
				`Repository "${repo}" has no starter models. Use a repository created from the starter in the Prismic dashboard.`,
			);
		}
		const starterPackageName = starter.id.split("/").at(-1);
		isStarterPackage = Boolean(
			starterPackageName && (await readPackageJson()).name === starterPackageName,
		);
		if (isStarterPackage) {
			const projectRoot = await findProjectRoot();
			await Promise.all([
				rm(new URL(".deployment", projectRoot), { recursive: true, force: true }),
				rm(new URL("documents", projectRoot), { recursive: true, force: true }),
			]);
		}
	}

	// When reconnecting, never overwrite local models that differ from remote.
	const hasModelConflicts =
		hasConfig &&
		[customTypeOps, sliceOps].some((ops) => ops.update.length > 0 || ops.delete.length > 0);

	if (!hasModelConflicts) {
		for (const model of sliceOps.update) await adapter.updateSlice(model);
		for (const model of sliceOps.delete) await adapter.deleteSlice(model.id);
		for (const model of sliceOps.insert) await adapter.createSlice(model);
		for (const model of customTypeOps.update) await adapter.updateCustomType(model);
		for (const model of customTypeOps.delete) await adapter.deleteCustomType(model.id);
		for (const model of customTypeOps.insert) await adapter.createCustomType(model);
	}

	await adapter.generateTypes();

	if (hasModelConflicts) {
		console.warn(
			dedent`
				Local and remote models differ, so no model files were changed. The project is connected.

				Choose the source of truth:
				  prismic pull --force   Adopt remote models
				  prismic push --force   Keep local models
			`,
		);
	}

	if (starter) {
		try {
			const previews = await getPreviews({ repo, token, host });
			await Promise.all(
				previews
					.filter((preview) => preview.label === "Starter Preview")
					.map((preview) => removePreview(preview.id, { repo, token, host })),
			);
			if (!previews.some((preview) => preview.url === adapter.localPreviewUrl)) {
				await addPreview(adapter.localPreviewConfig, { repo, token, host });
			}
		} catch (error) {
			await sentryCaptureError(error);
			console.error(
				`Could not configure the local preview. Run \`prismic preview add ${adapter.localPreviewUrl} --name ${adapter.localPreviewConfig.name}\` manually. Continuing.`,
			);
		}

		try {
			await setSimulatorUrl(adapter.localSimulatorUrl, { repo, token, host });
		} catch (error) {
			await sentryCaptureError(error);
			console.error(
				`Could not configure the local slice simulator. Run \`prismic preview set-simulator ${adapter.localSimulatorUrl}\` manually. Continuing.`,
			);
		}

		await completeOnboardingSteps(["instantStart_continueBuildingLocally"], {
			repo,
			token,
			host,
		}).catch(() => {});

		if (isStarterPackage) await updatePackageJsonName(repo);

		if (!hasModelConflicts) {
			console.info("\n---");
			console.info("\nYour project is ready! Here's what you can do next:");
			console.info("- Run `npm run dev` to start the development server");
			console.info(`- Open https://${repo}.${host}/builder to preview pages live`);
			console.info("\nStart building 🚀");
		}
	} else {
		console.info("\n---");
		console.info(`\nInitialized Prismic for repository "${repo}".`);
		console.info("Run `prismic type create <name>` to create a content type.");
		console.info("Run `prismic pull` to pull models from Prismic.");
	}

	// Printed last so it is the step the reader is left with.
	const previewInstructions = await adapter.getPreviewComponentInstructions();
	if (previewInstructions) console.info(`\n${previewInstructions}`);
});
