import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { exists, readURLFile } from "../lib/file";
import { installDependencies } from "../lib/packageJson";
import { setSimulatorUrl } from "../lib/prismic/clients/core";
import { getOrCreateInstantStartExport } from "../lib/prismic/clients/website-generator";
import { extractZip } from "../lib/zip";
import { authenticateInit } from "./init-auth";

const config = {
	name: "prismic init instant",
	description: "Download and set up an existing generated Prismic project.",
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
	const { token, host } = await authenticateInit(noBrowser);
	await setupInstantProject(repo, { token, host });
});

async function setupInstantProject(
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

		console.info("Installing dependencies...");
		await installDependencies({ start: pathToFileURL(destination) });

		console.info("Setting local simulator URL...");
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
