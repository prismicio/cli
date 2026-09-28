import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import {
	getInstallCommand,
	getMajorDependencyUpdates,
	installDependencies,
	readPackageJson,
} from "../lib/packageJson";

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
	const packageJson = await readPackageJson();
	await adapter.setupProject();
	for (const { name, from, to } of getMajorDependencyUpdates(
		packageJson,
		await readPackageJson(),
	)) {
		console.info(
			`Updated ${name} from ${from} to ${to}. Check your code for breaking changes in the new version.`,
		);
	}

	if (!values["no-install"]) {
		try {
			console.info("Installing dependencies...");
			await installDependencies();
		} catch {
			console.warn(
				`Could not install dependencies. Run \`${await getInstallCommand()}\` to finish.\nThe rest of the setup is done.`,
			);
		}
	}

	console.info("Generated setup files.");

	const previewInstructions = await adapter.getPreviewComponentInstructions();
	if (previewInstructions) console.info(`\n${previewInstructions}`);
});
