import { getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getUserEnvironments } from "../lib/prismic/environments";
import { formatTable } from "../lib/string";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic env list",
	description: `
		List the environments available for the project.

		@experimental - This command may change or be removed in any release and does not follow semver.
	`,
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const projectRepo = await getRepositoryName();
	const { json, repo = projectRepo } = values;

	const { token, host } = await getCredentials();
	const environments = await getUserEnvironments({ repo, token, host });

	let activeEnvironment: string | undefined;
	if (repo === projectRepo) {
		const adapter = await getAdapter();
		activeEnvironment = (await adapter.getEnvironment()) ?? projectRepo;
	}

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
