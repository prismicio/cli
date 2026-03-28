import type { Select } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldTarget, resolveModel, TARGET_OPTIONS } from "../models";

const config = {
	name: "prismic field add select",
	description: "Add a select field to a slice or custom type.",
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
		"default-value": { type: "string", description: "Default selected value" },
		option: { type: "string", multiple: true, description: "Select option value (can be repeated)" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const {
		label,
		placeholder,
		"default-value": default_value,
		option: options,
	} = values;

	const adapter = await getAdapter();
	const [fields, saveModel] = await resolveModel(values, { adapter });
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field: Select = {
		type: "Select",
		config: {
			label: label ?? capitalCase(fieldId),
			placeholder,
			default_value,
			options,
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${fieldId}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();
	await adapter.generateTypes();

	console.info(`Field added: ${id}`);
});
