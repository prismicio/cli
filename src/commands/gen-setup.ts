import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { flushActions, formatAction } from "../lib/logger";
import { installDependencies } from "../lib/packageJson";
import { findProjectRoot } from "../project";

const config = {
	name: "prismic gen setup",
	description: `
		Generate framework-specific setup files for a Prismic project.

		Installs dependencies, creates the Prismic client file, slice simulator
		page, preview routes, and other files required by the detected framework.
		Skips files that already exist.
	`,
	options: {
		"no-install": {
			type: "boolean",
			description: "Skip installing dependencies",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const adapter = await getAdapter();
	await adapter.setupProject();

	if (!values["no-install"]) {
		try {
			console.info("Installing dependencies...");
			await installDependencies();
		} catch {
			console.warn(
				"Could not install dependencies automatically. Please install them manually (i.e. `npm install`).",
			);
		}
	}

	const projectRoot = await findProjectRoot();
	for (const action of flushActions()) {
		console.info(formatAction(action, projectRoot));
	}
	console.info("Generated setup files.");
});
