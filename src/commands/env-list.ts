import { getHost, getToken } from "../auth";
import { getEnvironment, getUserEnvironments } from "../environments";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { formatTable } from "../lib/string";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic env list",
	description: "List the environments available for the project.",
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { json, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const environments = await getUserEnvironments({ repo, token, host });

	const activeEnvironment = (await getEnvironment()) ?? (await getRepositoryName());

	if (json) {
		const results = environments.map((environment) => ({
			domain: environment.domain,
			kind: environment.kind,
			active: environment.domain === activeEnvironment,
		}));
		console.info(stringify(results));
		return;
	}

	const rows = environments.map((environment) => {
		return [
			environment.domain,
			environment.kind,
			environment.domain === activeEnvironment ? "*" : "",
		];
	});
	console.info(formatTable(rows, { headers: ["DOMAIN", "KIND", "ACTIVE"] }));
});
