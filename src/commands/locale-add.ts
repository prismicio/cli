import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { upsertLocale } from "../lib/prismic/clients/locale";
import { resolveEnvironment } from "../lib/prismic/environments";
import { getRepositoryName } from "../project";

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
		repo: { type: "string", short: "r", description: "Repository domain" },
		env: { type: "string", short: "e", description: "Environment domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [code] = positionals;
	const { repo: parentRepo = await getRepositoryName(), env, master = false, name } = values;

	const { token, host } = await getCredentials();
	const repo = env ? await resolveEnvironment(env, { repo: parentRepo, token, host }) : parentRepo;

	await upsertLocale({ id: code, isMaster: master, customName: name }, { repo, token, host });

	console.info(`Locale added: ${code}`);
});
