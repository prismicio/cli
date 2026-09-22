import { getAdapter } from "../adapters";
import { formatFieldTable } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { readConfig } from "../project";

const config = {
	name: "prismic type view",
	description: "View details of a content type.",
	positionals: {
		id: { description: "ID of the content type", required: true },
	},
	options: {
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals: [id], values }) => {
	const adapter = await getAdapter();
	const { model: type } = await adapter.getCustomType(id);

	if (values.json) {
		console.info(stringify(type));
		return;
	}

	const route = (await readConfig()).routes?.find((route) => route.type === type.id);

	console.info(`ID: ${type.id}`);
	console.info(`Name: ${type.label || "(no name)"}`);
	console.info(`Format: ${type.format ?? "custom"}`);
	console.info(`Repeatable: ${type.repeatable}`);
	console.info(`Route: ${route?.path ?? "none"}`);

	for (const [tabName, fields] of Object.entries(type.json)) {
		console.info("");
		console.info(`${tabName}:`);
		console.info(formatFieldTable(fields));
	}
});
