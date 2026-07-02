import { getHost, getToken } from "../auth";
import { getActiveRepositoryName, getAvailableEnvironments } from "../environments";
import { createCommand, type CommandConfig } from "../lib/command";
import { formatTable } from "../lib/string";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic env list",
	description: `
		List environments available on a Prismic repository, including production.
	`,
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();

	const environments = await getAvailableEnvironments({ repo, token, host });
	const active = (await getActiveRepositoryName()) ?? repo;

	const rows = environments.map((environment) => {
		const label = environment.kind === "prod" ? "production" : environment.name;
		const marker = environment.domain === active ? " (active)" : "";
		return [environment.domain, `${label}${marker}`];
	});
	console.info(formatTable(rows, { headers: ["DOMAIN", "NAME"] }));
});
