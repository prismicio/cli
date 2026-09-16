import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic env active",
	description: "Print the active environment.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const repo = await getRepositoryName();
	const adapter = await getAdapter();
	const environment = await adapter.getEnvironment();
	console.info(environment ?? repo);
});
