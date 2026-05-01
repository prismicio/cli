import { capitalCase } from "change-case";

import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { resolveFieldContainer, resolveFieldTarget, SOURCE_OPTIONS } from "../models";

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

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;

	const [fields] = await resolveFieldContainer(id, values);
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field = targetFields[fieldId];
	if (!field) {
		throw new CommandError(`Field "${id}" does not exist.`);
	}

	if (values.json) {
		console.info(stringify({ id: fieldId, ...field }));
		return;
	}

	console.info(`Type: ${field.type}`);

	if (field.config) {
		for (const [key, value] of Object.entries(field.config)) {
			if (value === undefined) continue;

			if (key === "fields" && typeof value === "object" && value !== null) {
				const ids = Object.keys(value).join(", ") || "(none)";
				console.info(`Fields: ${ids}`);
			} else if (Array.isArray(value)) {
				console.info(`${capitalCase(key)}: ${value.join(", ")}`);
			} else {
				console.info(`${capitalCase(key)}: ${value}`);
			}
		}
	}
});
