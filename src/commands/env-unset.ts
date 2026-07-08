import { saveEnvironment } from "../environments";
import { createCommand, type CommandConfig } from "../lib/command";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic env unset",
	description: "Reset the active environment to the production environment.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const repo = await getRepositoryName();
	await saveEnvironment(undefined);
	console.info(`Reset to the production environment "${repo}".`);
});
