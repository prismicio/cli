import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { exists, readURLFile } from "../lib/file";
import { installDependencies } from "../lib/packageJson";
import { setSimulatorUrl } from "../lib/prismic/clients/core";
import { getProfile } from "../lib/prismic/clients/user";
import { getOrCreateInstantStartExport } from "../lib/prismic/clients/website-generator";
import { extractZip } from "../lib/zip";

const config = {
	name: "prismic instant-start",
	description: `
		Download and set up an existing Instant Start repository.
	`,
	options: {
		export: {
			type: "string",
			description: "Existing repository to export",
			required: true,
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { export: repositoryToExport } = values;
	const { token, host } = await getCredentials();

	console.info("Checking Prismic login...");
	const profile = await getProfile({ token, host });
	console.info(`Logged in as ${profile.email}`);

	const repositoryId = repositoryToExport.toLowerCase();
	assertRepositoryName(repositoryId);

	let extractedProject: { destination: string; destinationExisted: boolean } | undefined;

	try {
		console.info("Preparing the project export...");
		const readyExport = await getOrCreateInstantStartExport(repositoryId, {
			token,
			host,
		});

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
			token,
			host,
		});

		console.info(`
Your project is ready 🎉

Here's what you can do next:

1. Start the development server:
  cd ${destination}
  npm run dev

2. Preview your pages live at https://${repositoryId}.${host}/builder

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
});

function assertRepositoryName(repositoryId: string): void {
	if (!/^[a-z0-9][a-z0-9-]*$/.test(repositoryId)) {
		throw new CommandError(`Invalid repository name: ${repositoryId}`);
	}
}
