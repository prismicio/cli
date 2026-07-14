import { getHost, getToken } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getLocales } from "../lib/prismic/clients/locale";
import { resolveEnvironment } from "../lib/prismic/environments";
import { formatTable } from "../lib/string";
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
		env: { type: "string", short: "e", description: "Environment domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo: parentRepo = await getRepositoryName(), env, json } = values;

	const token = await getToken();
	const host = await getHost();
	const repo = env ? await resolveEnvironment(env, { repo: parentRepo, token, host }) : parentRepo;

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
