import { getAdapter } from "../adapters";
import { formatFieldTable } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getLegacySlices } from "../lib/prismic/models";
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

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { json } = values;

	const adapter = await getAdapter();
	const { model: type } = await adapter.getCustomType(id);

	if (json) {
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
		for (const [fieldId, field] of Object.entries(fields)) {
			if (field.type !== "Slices") continue;
			const sliceIds = Object.entries(field.config?.choices ?? {}).map(([sliceId, choice]) =>
				choice.type === "SharedSlice" ? sliceId : `${sliceId} *`,
			);
			console.info(`\n  ${fieldId} slices: ${sliceIds.join(", ") || "(none)"}`);
		}
	}

	if (getLegacySlices([type]).length > 0) {
		console.info("\n* Legacy slice. The CLI cannot edit legacy slices.");
	}
});
