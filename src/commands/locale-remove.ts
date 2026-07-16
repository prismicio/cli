import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { removeLocale } from "../lib/prismic/clients/locale";

const config = {
	name: "prismic locale remove",
	description: `
		Remove a locale from a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		code: { description: "Locale code (e.g. en-us, fr-fr)", required: true },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: { type: "string", short: "e", description: "(deprecated) Alias for --repo" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [code] = positionals;
	const {
		env,
		repo = env ?? (await getActiveRepositoryName()),
	} = values;

	const { token, host } = await getCredentials();

	await removeLocale(code, { repo, token, host });

	console.info(`Locale removed: ${code}`);
});
