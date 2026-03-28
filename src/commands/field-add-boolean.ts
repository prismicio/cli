import type { BooleanField } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldTarget, resolveModel, TARGET_OPTIONS } from "../models";

const config = {
	name: "prismic field add boolean",
	description: "Add a boolean field to a slice or custom type.",
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		"default-value": { type: "boolean", description: "Default value" },
		"true-label": { type: "string", description: "Label for true value" },
		"false-label": { type: "string", description: "Label for false value" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const {
		label,
		"default-value": default_value,
		"true-label": placeholder_true,
		"false-label": placeholder_false,
	} = values;

	const adapter = await getAdapter();
	const [fields, saveModel] = await resolveModel(values, { adapter });
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field: BooleanField = {
		type: "Boolean",
		config: {
			label: label ?? capitalCase(fieldId),
			default_value,
			placeholder_true,
			placeholder_false,
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${fieldId}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();
	await adapter.generateTypes();

	console.info(`Field added: ${id}`);
});
