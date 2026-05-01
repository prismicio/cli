import { getHost, getToken } from "../auth";
import { getLocales, upsertLocale } from "../clients/locale";
import { resolveEnvironment } from "../environments";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

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
		repo: { type: "string", short: "r", description: "Repository domain" },
		env: { type: "string", short: "e", description: "Environment domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [code] = positionals;
	const { repo: parentRepo = await getRepositoryName(), env } = values;

	const token = await getToken();
	const host = await getHost();
	const repo = env ? await resolveEnvironment({ env, repo: parentRepo, token, host }) : parentRepo;

	let locales;
	try {
		locales = await getLocales({ repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to set master locale: ${message}`);
		}
		throw error;
	}

	const locale = locales.find((l) => l.id === code);

	if (!locale) {
		throw new CommandError(
			`Locale "${code}" not found. Available locales: ${locales.map((l) => l.id).join(", ")}`,
		);
	}

	if (locale.isMaster) {
		throw new CommandError(`Locale "${code}" is already the master.`);
	}

	try {
		await upsertLocale(
			{ id: locale.id, isMaster: true, customName: locale.customName ?? undefined },
			{ repo, token, host },
		);
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to set master locale: ${message}`);
		}
		throw error;
	}

	console.info(`Master locale set: ${code}`);
});
