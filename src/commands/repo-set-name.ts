import { getHost, getToken } from "../auth";
import { setRepositoryName } from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic repo set-name",
	description: `
		Set the display name of a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		name: { description: "Display name for the repository" },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [displayName] = positionals;
	const { repo = await getRepositoryName() } = values;

	if (!displayName) {
		throw new CommandError("Missing required argument: <name>");
	}

	const token = await getToken();
	const host = await getHost();

	let confirmedName;
	try {
		confirmedName = await setRepositoryName(displayName, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to set repository name: ${message}`);
		}
		throw error;
	}

	console.info(`Repository name set to: ${confirmedName}`);
});
