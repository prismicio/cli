import { getHost, getToken } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { setRepositoryName } from "../lib/prismic/clients/wroom";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic repo set-name",
	description: `
		Set the display name of a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		name: { description: "Display name for the repository", required: true },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [displayName] = positionals;
	const { repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();

	const confirmedName = await setRepositoryName(displayName, { repo, token, host });

	console.info(`Repository name set to: ${confirmedName}`);
});
