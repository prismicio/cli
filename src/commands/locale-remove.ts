import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { removeLocale } from "../lib/prismic/clients/locale";
import { resolveEnvironment } from "../lib/prismic/environments";
import { getRepositoryName } from "../project";

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
		repo: { type: "string", short: "r", description: "Repository domain" },
		env: { type: "string", short: "e", description: "Environment domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [code] = positionals;
	const { repo: parentRepo = await getRepositoryName(), env } = values;

	const { token, host } = await getCredentials();
	const repo = env ? await resolveEnvironment(env, { repo: parentRepo, token, host }) : parentRepo;

	await removeLocale(code, { repo, token, host });

	console.info(`Locale removed: ${code}`);
});
