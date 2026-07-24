import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createLoginSession, getCredentials } from "../auth";
import { env } from "../env";
import { openBrowser } from "../lib/browser";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { exists, readURLFile } from "../lib/file";
import { installDependencies } from "../lib/packageJson";
import { addPreview, removePreviewsByURL, setSimulatorUrl } from "../lib/prismic/clients/core";
import { getProfile } from "../lib/prismic/clients/user";
import { getOrCreateInstantStartExport } from "../lib/prismic/clients/website-generator";
import { ForbiddenRequestError, UnauthorizedRequestError } from "../lib/request";
import { extractZip } from "../lib/zip";

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
	const { token, host } = await authenticateStarterDownload(noBrowser);
	await downloadStarter(repo, { token, host });
});

async function downloadStarter(
	repository: string,
	config: { token: string | undefined; host: string },
): Promise<void> {
	const repositoryId = repository.toLowerCase();
	assertRepositoryName(repositoryId);

	let extractedProject: { destination: string; destinationExisted: boolean } | undefined;

	try {
		console.info("Preparing the project export...");
		const readyExport = await getOrCreateInstantStartExport(repositoryId, config);

		console.info("Downloading the project...");
		const archive = await readURLFile(new URL(readyExport.downloadUrl));
		const destination = resolve(process.cwd(), repositoryId);
		const destinationExisted = await exists(pathToFileURL(destination));
		await extractZip(new Uint8Array(await archive.arrayBuffer()), destination);
		extractedProject = { destination, destinationExisted };
		await rm(join(destination, "documents"), { recursive: true, force: true });

		console.info("Installing dependencies...");
		await installDependencies({ start: pathToFileURL(destination) });

		console.info("Configuring local previews...");
		await removePreviewsByURL(readyExport.previewUrls, { repo: repositoryId, ...config });
		await addPreview(
			{
				name: "Development",
				websiteURL: "http://localhost:3000",
				resolverPath: "/api/preview",
			},
			{ repo: repositoryId, ...config },
		);
		await setSimulatorUrl("http://localhost:3000/slice-simulator", {
			repo: repositoryId,
			...config,
		});

		console.info(`
Your project is ready 🎉

Here's what you can do next:

1. Start the development server:
  cd ${destination}
  npm run dev

2. Preview your pages live at https://${repositoryId}.${config.host}/builder

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
): Promise<{ host: string; token: string | undefined }> {
	const { host, token: initialToken } = await getCredentials();
	let token = initialToken;

	try {
		await getProfile({ token, host });
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
		await getProfile({ token, host });
	}

	return { host, token };
}
