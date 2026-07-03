import { unsetActiveEnvironment } from "../active-environment";
import { createCommand, type CommandConfig } from "../lib/command";
import { readConfig } from "../project";

const config = {
	name: "prismic env unset",
	description: `
		Reset the active environment to the production environment.
	`,
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const { repositoryName } = await readConfig();

	unsetActiveEnvironment();

	console.info(`Reset to the production environment "${repositoryName}".`);
});
