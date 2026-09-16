import { getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { getUserEnvironments, InvalidEnvironmentError } from "../lib/prismic/environments";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic env set",
	description: "Set the active environment.",
	positionals: {
		environment: { description: "Environment domain", required: true },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals }) => {
	const [environment] = positionals;

	const repo = await getRepositoryName();
	const { token, host } = await getCredentials();
	const environments = await getUserEnvironments({ repo, token, host });

	const validEnvironment = environments.some((env) => env.domain === environment);
	if (!validEnvironment) throw new InvalidEnvironmentError(environment, environments, repo);

	const adapter = await getAdapter();

	if (environment === repo) {
		await adapter.unsetEnvironment();
		console.info(`Reset to the production environment "${repo}".`);
		return;
	}

	await adapter.setEnvironment(environment);
	console.info(`Set the active environment to "${environment}".`);
});
