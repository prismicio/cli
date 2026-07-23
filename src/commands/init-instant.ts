import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Profile } from "../lib/prismic/clients/user";

import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { exists, readURLFile } from "../lib/file";
import {
	assertInstantStartRepositoryAccess,
	instantStartArchiveURL,
	instantStartHostedPreviewURL,
	patchInstantStartConfig,
} from "../lib/instant-start";
import { installDependencies } from "../lib/packageJson";
import { removePreviewsByURL, setSimulatorUrl } from "../lib/prismic/clients/core";
import { extractZip } from "../lib/zip";
import { authenticateInit } from "./init-auth";

const config = {
	name: "prismic init instant",
	description: "Instantly start a ready-to-run Prismic project.",
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
	const { token, host, profile } = await authenticateInit(noBrowser);
	await setupInstantProject(repo, { token, host, profile });
});

async function setupInstantProject(
	repository: string,
	config: { token: string | undefined; host: string; profile: Profile },
): Promise<void> {
	const repositoryId = repository.toLowerCase();
	assertRepositoryName(repositoryId);
	assertInstantStartRepositoryAccess(repositoryId, config.profile);

	let extractedProject: { destination: string; destinationExisted: boolean } | undefined;

	try {
		console.info("Downloading the project...");
		const archive = await readURLFile(instantStartArchiveURL);
		const destination = resolve(process.cwd(), repositoryId);
		const destinationExisted = await exists(pathToFileURL(destination));
		await extractZip(new Uint8Array(await archive.arrayBuffer()), destination, {
			stripSingleRootDirectory: true,
		});
		extractedProject = { destination, destinationExisted };
		await patchInstantStartConfig(destination, repositoryId, config.host);

		console.info("Installing dependencies...");
		await installDependencies({ start: pathToFileURL(destination) });

		console.info("Configuring local previews...");
		await removePreviewsByURL([instantStartHostedPreviewURL], {
			repo: repositoryId,
			token: config.token,
			host: config.host,
		});
		await setSimulatorUrl("http://localhost:3000/slice-simulator", {
			repo: repositoryId,
			token: config.token,
			host: config.host,
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
