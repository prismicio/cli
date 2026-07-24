import { mkdir, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { createLoginSession, getCredentials } from "../auth";
import { env } from "../env";
import { openBrowser } from "../lib/browser";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { exists, readURLFile } from "../lib/file";
import { installDependencies } from "../lib/packageJson";
import {
	addPreview,
	hasPreviewByURL,
	removePreviewsByURL,
	setSimulatorUrl,
} from "../lib/prismic/clients/core";
import { getProfile, type Profile } from "../lib/prismic/clients/user";
import { getOrCreateInstantStartExport } from "../lib/prismic/clients/website-generator";
import { ForbiddenRequestError, UnauthorizedRequestError } from "../lib/request";
import { sentryCaptureError } from "../lib/sentry";
import { extractZip } from "../lib/zip";
import { checkIsTypeBuilderEnabled, TypeBuilderRequiredError } from "../project";

const config = {
	name: "prismic starter download",
	description: "Download and configure the official starter for a Prismic repository.",
	options: {
		repo: {
			type: "string",
			short: "r",
			description: "Repository name",
			required: true,
		},
		"no-browser": {
			type: "boolean",
			description: "Skip opening the browser automatically during login",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo, "no-browser": noBrowser } = values;
	const repositoryId = repo.toLowerCase();
	assertRepositoryName(repositoryId);

	const { token, host, profile } = await authenticateStarterDownload(noBrowser);
	const hasRepoAccess = profile.repositories.some(
		(repository) => repository.domain === repositoryId,
	);
	if (!hasRepoAccess) {
		throw new CommandError(
			`Repository "${repositoryId}" not found in your account. Check the name or request access to the repository.`,
		);
	}

	const isTypeBuilderEnabled = await checkIsTypeBuilderEnabled(repositoryId, { token, host });
	if (!isTypeBuilderEnabled) {
		throw new TypeBuilderRequiredError(repositoryId, host);
	}

	await downloadStarter(repositoryId, { token, host });
});

const localPreviewConfig = {
	// nextjs only for now
	name: "Development",
	websiteURL: "http://localhost:3000",
	resolverPath: "/api/preview",
};
const previewUrl = `${localPreviewConfig.websiteURL}${localPreviewConfig.resolverPath}`;
const simulatorUrl = `${localPreviewConfig.websiteURL}/slice-simulator`;

async function downloadStarter(
	repository: string,
	config: { token: string | undefined; host: string },
): Promise<void> {
	let extractedProject: { destination: string; destinationExisted: boolean } | undefined;

	try {
		console.info("Preparing the project export...");
		const readyExport = await getOrCreateInstantStartExport(repository, config);

		console.info("Downloading the project...");
		const archive = await readURLFile(new URL(readyExport.downloadUrl));
		const destination = resolve(process.cwd(), repository);
		const destinationExisted = await exists(pathToFileURL(destination));
		await extractZip(new Uint8Array(await archive.arrayBuffer()), destination);
		extractedProject = { destination, destinationExisted };

		// part of the typical starter cleanup, documents were already pushed
		await rm(join(destination, "documents"), { recursive: true, force: true });

		console.info("Installing dependencies...");
		try {
			const destinationUrl = pathToFileURL(`${destination}${sep}`);
			await installDependencies({ start: destinationUrl, stop: destinationUrl });
		} catch {
			console.warn(
				"Could not install dependencies automatically. Please install them manually (i.e. `npm install`).",
			);
		}

		console.info("Configuring local previews and simulator...");
		const coreConfig = { repo: repository, ...config };

		let localPreviewConfigured = false;
		try {
			await removePreviewsByURL(readyExport.previewUrls, coreConfig);
			const hasDevelopmentPreview = await hasPreviewByURL(previewUrl, coreConfig);
			if (!hasDevelopmentPreview) {
				await addPreview(localPreviewConfig, coreConfig);
			}
			localPreviewConfigured = true;
		} catch (error) {
			await sentryCaptureError(error);
			const commandArgs = [
				"prismic",
				"preview",
				"add",
				previewUrl,
				"--name",
				localPreviewConfig.name,
			];
			console.error(
				`Could not configure local preview. Please configure it manually (i.e. \`${commandArgs.join(" ")}\`). Continuing.`,
			);
		}

		try {
			await setSimulatorUrl(simulatorUrl, coreConfig);
		} catch (error) {
			await sentryCaptureError(error);
			const commandArgs = ["prismic", "preview", "set-simulator", simulatorUrl];
			console.error(
				`Could not configure local slice simulator. Please configure it manually (i.e. \`${commandArgs.join(" ")}\`). Continuing.`,
			);
		}

		let previewInstruction = "";
		if (localPreviewConfigured) {
			previewInstruction = `• Preview your pages live at https://${repository}.${config.host}/builder\n`;
		}
		console.info(`
Your project is ready 🎉

Here's what you can do next:

• Start the development server:
  cd ${destination}
  npm run dev

${previewInstruction}
Start building 🚀
`);
	} catch (error) {
		if (extractedProject) {
			await rm(extractedProject.destination, { recursive: true, force: true });
			if (extractedProject.destinationExisted) {
				await mkdir(extractedProject.destination);
			}
		}
		throw error;
	}
}

function assertRepositoryName(repositoryId: string): void {
	if (!/^[a-z0-9][a-z0-9-]*$/.test(repositoryId)) {
		throw new CommandError(`Invalid repository name: ${repositoryId}`);
	}
}

async function authenticateStarterDownload(
	noBrowser: boolean | undefined,
): Promise<{ host: string; token: string | undefined; profile: Profile }> {
	const { host, token: initialToken } = await getCredentials();
	let token = initialToken;
	let profile: Profile;

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

		const loggedIn = await getCredentials();
		token = loggedIn.token;
		profile = await getProfile({ token, host });
	}

	return { host, token, profile };
}
