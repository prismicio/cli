import { getActiveRepositoryName } from "../environments";
import { createCommand, type CommandConfig } from "../lib/command";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic env active",
	description: `
		Print the active environment, or production if none is set.
	`,
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const active = await getActiveRepositoryName();
	if (active) {
		console.info(active);
		return;
	}
	console.info(`${await getRepositoryName()} (production)`);
});
