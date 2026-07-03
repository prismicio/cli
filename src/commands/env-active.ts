import { createCommand, type CommandConfig } from "../lib/command";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic env active",
	description: `
		Print the active environment.

		Prints the production environment when no environment is active.
	`,
} satisfies CommandConfig;

export default createCommand(config, async () => {
	console.info(await getRepositoryName());
});
