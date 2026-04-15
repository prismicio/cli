import { getHost, getToken } from "../auth";
import { getCustomType } from "../clients/custom-types";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { formatTable } from "../lib/string";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic type view",
	description: "View details of a content type.",
	positionals: {
		id: { description: "ID of the content type", required: true },
	},
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { json, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const type = await getCustomType(id, { repo, token, host });

	if (json) {
		console.info(stringify(type));
		return;
	}

	console.info(`ID: ${type.id}`);
	console.info(`Name: ${type.label || "(no name)"}`);
	console.info(`Format: ${type.format}`);
	console.info(`Repeatable: ${type.repeatable}`);

	for (const [tabName, fields] of Object.entries(type.json)) {
		console.info("");
		console.info(`${tabName}:`);
		const entries = Object.entries(fields);
		if (entries.length === 0) {
			console.info("  (no fields)");
		} else {
			const rows = entries.map(([id, field]) => {
				const config = field.config as Record<string, unknown> | undefined;
				const label = (config?.label as string) || "";
				const placeholder = config?.placeholder ? `"${config.placeholder}"` : "";
				return [`  ${id}`, field.type, label, placeholder];
			});
			console.info(formatTable(rows));
		}
	}
});
