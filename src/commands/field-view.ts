import { capitalCase } from "change-case";

import { getExistingField, SOURCE_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";

const config = {
	name: "prismic field view",
	description: "View details of a field in a slice or custom type.",
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...SOURCE_OPTIONS,
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals: [id], values }) => {
	const { field, fieldId } = await getExistingField(id, values);
	if (values.json) {
		console.info(stringify({ id: fieldId, ...field }));
		return;
	}

	console.info(`Type: ${field.type}`);

	for (const [key, value] of Object.entries(field.config ?? {})) {
		if (value === undefined) continue;

		if (key === "fields" && typeof value === "object" && value !== null) {
			console.info(`Fields: ${Object.keys(value).join(", ") || "(none)"}`);
		} else if (Array.isArray(value)) {
			console.info(`${capitalCase(key)}: ${value.join(", ")}`);
		} else {
			console.info(`${capitalCase(key)}: ${value}`);
		}
	}
});
