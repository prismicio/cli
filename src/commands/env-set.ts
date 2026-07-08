import { getHost, getToken } from "../auth";
import { getUserEnvironments, InvalidEnvironmentError, saveEnvironment } from "../environments";
import { createCommand, type CommandConfig } from "../lib/command";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic env set",
	description: "Set the active environment.",
	positionals: {
		env: { description: "Environment domain", required: true },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals }) => {
	const [env] = positionals;

	const repo = await getRepositoryName();
	const token = await getToken();
	const host = await getHost();
	const environments = await getUserEnvironments({ repo, token, host });

	const validEnvironment = environments.some((environment) => environment.domain === env);
	if (!validEnvironment) throw new InvalidEnvironmentError(env, environments, repo);

	if (env === repo) {
		await saveEnvironment(undefined);
		console.info(`Reset to the production environment "${repo}".`);
		return;
	}

	await saveEnvironment(env);
	console.info(`Set the active environment to "${env}".`);
});
