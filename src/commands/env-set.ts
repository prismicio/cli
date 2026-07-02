import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { resolveEnvironment } from "../environments";
import { createCommand, type CommandConfig } from "../lib/command";
import { removeEnvVar, setEnvVar } from "../lib/env-file";
import { findProjectRoot, getRepositoryName } from "../project";

const config = {
	name: "prismic env set",
	description: `
		Set the active environment for local development.

		Writes the environment to .env.local. The website and CLI read it as the
		active repository. Setting production removes it.
	`,
	positionals: {
		environment: { description: "Environment domain", required: true },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [environment] = positionals;
	const { repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();

	const domain = await resolveEnvironment(environment, { repo, token, host });
	const adapter = await getAdapter();
	const path = new URL(".env.local", await findProjectRoot());

	if (domain === repo) {
		await removeEnvVar(path, adapter.repositoryEnvVar);
		console.info(`Active environment set to production: ${domain}`);
		return;
	}

	await setEnvVar(path, adapter.repositoryEnvVar, domain);
	console.info(`Active environment set: ${domain}`);
});
