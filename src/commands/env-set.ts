import { setActiveEnvironment, unsetActiveEnvironment } from "../active-environment";
import { getHost, getToken } from "../auth";
import { resolveEnvironment } from "../environments";
import { createCommand, type CommandConfig } from "../lib/command";
import { readConfig } from "../project";

const config = {
	name: "prismic env set",
	description: `
		Set the active environment for the project.

		The active environment is stored by the CLI and used by every command and by
		the project at build time. Setting the production environment is the same as
		\`prismic env unset\`.
	`,
	positionals: {
		name: { description: "Environment domain", required: true },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals }) => {
	const [name] = positionals;

	const { repositoryName } = await readConfig();
	const token = await getToken();
	const host = await getHost();

	const domain = await resolveEnvironment(name, { repo: repositoryName, token, host });

	if (domain === repositoryName) {
		unsetActiveEnvironment();
		console.info(`Reset to the production environment "${repositoryName}".`);
		return;
	}

	setActiveEnvironment(domain);
	console.info(`Set the active environment to "${domain}".`);
});
