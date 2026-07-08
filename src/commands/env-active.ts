import { getEnvironment } from "../environments";
import { createCommand, type CommandConfig } from "../lib/command";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic env active",
	description: "Print the active environment.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const activeEnvironment = (await getEnvironment()) ?? (await getRepositoryName());
	console.info(activeEnvironment);
});
