import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getLocales, upsertLocale } from "../lib/prismic/clients/locale";

const config = {
	name: "prismic locale set-master",
	description: `
		Set the master locale for a Prismic repository.

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

	const locales = await getLocales({ repo, token, host });

	const locale = locales.find((l) => l.id === code);

	if (!locale) {
		throw new CommandError(
			`Locale "${code}" not found. Available locales: ${locales.map((l) => l.id).join(", ")}`,
		);
	}

	if (locale.isMaster) {
		throw new CommandError(`Locale "${code}" is already the master.`);
	}

	await upsertLocale(
		{ id: locale.id, isMaster: true, customName: locale.customName ?? undefined },
		{ repo, token, host },
	);

	console.info(`Master locale set: ${code}`);
});
