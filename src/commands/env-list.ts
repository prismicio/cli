import { getActiveEnvironment } from "../active-environment";
import { getHost, getToken } from "../auth";
import { getUserEnvironments } from "../environments";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { formatTable } from "../lib/string";
import { readConfig } from "../project";

const config = {
	name: "prismic env list",
	description: `
		List the environments available for the project, marking the active one.
	`,
	options: {
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { json } = values;

	const { repositoryName } = await readConfig();
	const token = await getToken();
	const host = await getHost();

	const environments = await getUserEnvironments({ repo: repositoryName, token, host });
	const activeEnvironment = getActiveEnvironment() ?? repositoryName;

	if (json) {
		const results = environments.map((environment) => ({
			kind: environment.kind,
			name: environment.name,
			domain: environment.domain,
			active: environment.domain === activeEnvironment,
		}));
		console.info(stringify(results));
		return;
	}

	if (environments.length === 0) {
		console.info("No environments found.");
		return;
	}

	const rows = environments.map((environment) => {
		const activeLabel = environment.domain === activeEnvironment ? " (active)" : "";
		return [environment.domain, `${environment.name}${activeLabel}`];
	});
	console.info(formatTable(rows, { headers: ["DOMAIN", "NAME"] }));
});
