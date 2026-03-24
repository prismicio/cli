import { getHost, getToken } from "../auth";
import { upsertLocale } from "../clients/locale";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic locale add",
	description: `
		Add a locale to a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		code: { description: "Locale code (e.g. fr-fr, es-es)" },
	},
	options: {
		master: { type: "boolean", description: "Set as the master locale" },
		name: { type: "string", short: "n", description: "Custom display name (for custom locales)" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [code] = positionals;
	const { repo = await getRepositoryName(), master = false, name } = values;

	if (!code) {
		throw new CommandError("Missing required argument: <code>");
	}

	const token = await getToken();
	const host = await getHost();

	try {
		await upsertLocale({ id: code, isMaster: master, customName: name }, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to add locale: ${message}`);
		}
		throw error;
	}

	console.info(`Locale added: ${code}`);
});
