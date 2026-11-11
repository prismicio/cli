import { getAdapter } from "../adapters";
import { getCredentials, onUnauthorized } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getEnvironments, validateToken } from "../lib/prismic/client";
import { filterEnvironments } from "../lib/prismic/environments";
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
	const projectRepo = await getRepositoryName();
	const { json, repo = projectRepo } = values;

	const { token, host } = await getCredentials();
	const { results } = await getEnvironments({ repo, token, host, onUnauthorized });
	const session = await validateToken((await getCredentials()).token, { host });
	const environments = filterEnvironments(results, session);

	let activeEnvironment: string | undefined;
	if (repo === projectRepo) {
		const adapter = await getAdapter();
		activeEnvironment = (await adapter.getEnvironment()) ?? projectRepo;
	}

	if (json) {
		const output = environments.map((environment) => ({
			domain: environment.domain,
			kind: environment.kind,
			active: environment.domain === activeEnvironment,
		}));
		console.info(stringify(output));
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
