import { getHost, getToken } from "../auth";
import { getLocales } from "../clients/locale";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic locale list",
	description: `
		List all locales in a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName(), json } = values;

	const token = await getToken();
	const host = await getHost();

	let locales;
	try {
		locales = await getLocales({ repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to list locales: ${message}`);
		}
		throw error;
	}

	if (json) {
		console.info(stringify(locales));
		return;
	}

	if (locales.length === 0) {
		console.info("No locales found.");
		return;
	}

	for (const locale of locales) {
		const masterLabel = locale.isMaster ? " (master)" : "";
		console.info(`${locale.id}  ${locale.label}${masterLabel}`);
	}
});
