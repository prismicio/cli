import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getLocales } from "../lib/prismic/clients/locale";
import { formatTable } from "../lib/string";

const config = {
	name: "prismic locale list",
	description: `
		List all locales in a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: { type: "string", short: "e", description: "(deprecated) Alias for --repo" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const {
		env,
		repo = env ?? (await getActiveRepositoryName()),
		json,
	} = values;

	const { token, host } = await getCredentials();

	const locales = await getLocales({ repo, token, host });

	if (json) {
		console.info(stringify(locales));
		return;
	}

	if (locales.length === 0) {
		console.info("No locales found.");
		return;
	}

	const rows = locales.map((locale) => {
		const masterLabel = locale.isMaster ? " (master)" : "";
		return [locale.id, `${locale.label}${masterLabel}`];
	});
	console.info(formatTable(rows, { headers: ["ID", "LABEL"] }));
});
