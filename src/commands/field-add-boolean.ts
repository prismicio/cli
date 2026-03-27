import type { BooleanField } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveModel, TARGET_OPTIONS } from "./field";

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
		label = capitalCase(id),
		"default-value": default_value,
		"true-label": placeholder_true,
		"false-label": placeholder_false,
	} = values;

	const field: BooleanField = {
		type: "Boolean",
		config: {
			label,
			default_value,
			placeholder_true,
			placeholder_false,
		},
	};

	const adapter = await getAdapter();
	const [fields, saveModel] = await resolveModel(adapter, values);
	if (id in fields) throw new CommandError(`Field "${id}" already exists.`);
	fields[id] = field;
	await saveModel();
	await adapter.generateTypes();

	console.info(`Field added: ${id}`);
});
