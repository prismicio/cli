import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { exists, readURLFile } from "../lib/file";
import { installDependencies } from "../lib/packageJson";
import { setSimulatorUrl } from "../lib/prismic/clients/core";
import { getProfile } from "../lib/prismic/clients/user";
import {
	getOrCreateInstantStartExport,
	provisionInstantStart,
} from "../lib/prismic/clients/website-generator";
import { extractZip } from "../lib/zip";

const config = {
	name: "prismic instant-start",
	description: `
		Create a ready-to-run Prismic website from the Instant Start template.

		Use --export to download and set up an existing repository instead of
		creating a new one.
	`,
	options: {
		export: {
			type: "string",
			description: "Existing repository to export",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { export: repositoryToExport } = values;
	await runInstantStart({ repositoryToExport });
});

export async function runInstantStart(options: { repositoryToExport?: string }): Promise<void> {
	const { repositoryToExport } = options;
	const { token, host } = await getCredentials();

	console.info("Checking Prismic login...");
	const profile = await getProfile({ token, host });
	console.info(`Logged in as ${profile.email}`);

	let repositoryId = repositoryToExport?.toLowerCase();
	let createdRepository = false;

	if (!repositoryId) {
		console.info("Creating your Instant Start repository...");
		const provisioned = await provisionInstantStart({ token, host });
		repositoryId = provisioned.repositoryId;
		createdRepository = true;
		console.info(`Created repository: ${repositoryId}`);
	}

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
Your project is ready.

Project: ${destination}
Page Builder: https://${repositoryId}.${host}/builder

Run:
  cd ${repositoryId}
  npm run dev
`);
	} catch (error) {
		if (extractedProject) {
			await rm(extractedProject.destination, { recursive: true, force: true });
			if (extractedProject.destinationExisted) {
				await mkdir(extractedProject.destination);
			}
		}
		if (createdRepository) {
			console.error(
				`Repository "${repositoryId}" was created. Retry setup with:\n  npx prismic@latest instant-start --export ${repositoryId}`,
			);
		}
		throw error;
	}
}

function assertRepositoryName(repositoryId: string): void {
	if (!/^[a-z0-9][a-z0-9-]*$/.test(repositoryId)) {
		throw new CommandError(`Invalid repository name: ${repositoryId}`);
	}
}
