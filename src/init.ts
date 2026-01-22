import { parseArgs } from "node:util";

import { createConfig, readConfig, UnknownProjectRoot } from "./lib/config";

const HELP = `
Initialize a Prismic project by creating a prismic.config.json file.

Use this command to connect an existing Prismic repository to your project.
To create a new repository, use \`prismic repo create\` instead.

USAGE
  prismic init [flags]

FLAGS
  -r, --repo   Repository name (required)
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic <command> --help\` for more information about a command.
`.trim();

export async function init(): Promise<void> {
	const { values } = parseArgs({
		args: process.argv.slice(3),
		options: {
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
		},
	});

	if (values.help) {
		console.info(HELP);
		return;
	}

	if (!values.repo) {
		console.error("Missing required flag: --repo");
		process.exitCode = 1;
		return;
	}

	const existingConfig = await readConfig();
	if (existingConfig.ok) {
		console.error("A prismic.config.json file already exists.");
		process.exitCode = 1;
		return;
	}

	const result = await createConfig({ repositoryName: values.repo });

	if (!result.ok) {
		if (result.error instanceof UnknownProjectRoot) {
			console.error("Could not find a package.json file. Run this command from a project directory.");
		} else {
			console.error("Failed to create config file.");
		}
		process.exitCode = 1;
		return;
	}

	console.info(`Created prismic.config.json for repository "${values.repo}"`);
}
