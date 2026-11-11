import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { type RepositoryApiAccessLevel, setRepositoryApiAccess } from "../lib/prismic/client";
import { getRepositoryName } from "../project";

const VALID_LEVELS: RepositoryApiAccessLevel[] = ["private", "public", "open"];

const config = {
	name: "prismic repo set-api-access",
	description: `
		Set the Content API access level of a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.

		Run \`prismic docs view repository-settings#configuration\` for details.
	`,
	positionals: {
		level: { description: `Access level (${VALID_LEVELS.join(", ")})`, required: true },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [level] = positionals;
	const { repo = await getRepositoryName() } = values;

	if (!VALID_LEVELS.includes(level as RepositoryApiAccessLevel)) {
		throw new CommandError(
			`Invalid access level: ${level}. Must be one of: ${VALID_LEVELS.join(", ")}`,
		);
	}

	const { token, host } = await getCredentials();

	await setRepositoryApiAccess(level as RepositoryApiAccessLevel, { repo, token, host });

	console.info(`Repository access set to: ${level}`);
});
