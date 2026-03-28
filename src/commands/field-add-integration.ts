import type { IntegrationField } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldTarget, resolveModel, TARGET_OPTIONS } from "../models";

const config = {
	name: "prismic field add integration",
	description: "Add an integration field to a slice or custom type.",
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
		catalog: { type: "string", description: "Integration catalog ID" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { label, placeholder, catalog } = values;

	const adapter = await getAdapter();
	const [fields, saveModel] = await resolveModel(values, { adapter });
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field: IntegrationField = {
		type: "IntegrationFields",
		config: {
			label: label ?? capitalCase(fieldId),
			placeholder,
			catalog,
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${fieldId}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();
	await adapter.generateTypes();

	console.info(`Field added: ${id}`);
});
