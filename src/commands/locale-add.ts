import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { upsertLocale } from "../lib/prismic/clients/locale";

const config = {
	name: "prismic locale add",
	description: `
		Add a locale to a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		code: { description: "Locale code (e.g. fr-fr, es-es)", required: true },
	},
	options: {
		master: { type: "boolean", description: "Set as the master locale" },
		name: { type: "string", short: "n", description: "Custom display name (for custom locales)" },
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: { type: "string", short: "e", description: "(deprecated) Alias for --repo" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [code] = positionals;
	const {
		env,
		repo = env ?? (await getActiveRepositoryName()),
		master = false,
		name,
	} = values;

	const { token, host } = await getCredentials();

	await upsertLocale({ id: code, isMaster: master, customName: name }, { repo, token, host });

	console.info(`Locale added: ${code}`);
});
