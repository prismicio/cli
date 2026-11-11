import { getAdapter } from "../adapters";
import { getCredentials, onUnauthorized } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { getEnvironments, validateToken } from "../lib/prismic/client";
import { filterEnvironments, InvalidEnvironmentError } from "../lib/prismic/environments";
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
	const { results } = await getEnvironments({ repo, token, host, onUnauthorized });
	const session = await validateToken((await getCredentials()).token, { host });
	const environments = filterEnvironments(results, session);

	const validEnvironment = environments.some((env) => env.domain === environment);
	if (!validEnvironment) throw new InvalidEnvironmentError(environment, environments, repo);

	const adapter = await getAdapter();

	if (environment === repo) {
		await adapter.unsetEnvironment();
		console.info(`Reset to the production environment "${repo}".`);
	} else {
		await adapter.setEnvironment(environment);
		console.info(`Set the active environment to "${environment}".`);
	}

	const setupInstructions = await adapter.getSetupInstructions();
	if (setupInstructions) console.info(`\n${setupInstructions}`);
});
