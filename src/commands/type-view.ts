import { getHost, getToken } from "../auth";
import { getCustomTypes } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic type view",
	description: "View details of a content type.",
	positionals: {
		name: { description: "Name of the content type", required: true },
	},
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { json, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const customTypes = await getCustomTypes({ repo, token, host });
	const type = customTypes.find((ct) => ct.label === name);

	if (!type) {
		throw new CommandError(`Type not found: ${name}`);
	}

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
			for (const [id, field] of entries) {
				const config = field.config as Record<string, unknown> | undefined;
				const label = (config?.label as string) || "";
				const placeholder = config?.placeholder ? `"${config.placeholder}"` : "";
				console.info(`  ${[id, field.type, label, placeholder].filter(Boolean).join("  ")}`);
			}
		}
	}
});
