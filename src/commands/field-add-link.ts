import type { Link } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldTarget, resolveModel, TARGET_OPTIONS } from "../models";

const config = {
	name: "prismic field add link",
	description: "Add a link field to a slice or custom type.",
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		"allow-target-blank": { type: "boolean", description: "Allow opening in new tab" },
		"allow-text": { type: "boolean", description: "Allow custom link text" },
		repeatable: { type: "boolean", description: "Allow multiple links" },
		variant: { type: "string", multiple: true, description: "Allowed variant (can be repeated)" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const {
		label,
		"allow-target-blank": allowTargetBlank,
		"allow-text": allowText,
		repeatable: repeat,
		variant: variants,
	} = values;

	const adapter = await getAdapter();
	const [fields, saveModel] = await resolveModel(values, { adapter });
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field: Link = {
		type: "Link",
		config: {
			label: label ?? capitalCase(fieldId),
			allowTargetBlank,
			allowText,
			repeat,
			variants,
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${fieldId}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();
	await adapter.generateTypes();

	console.info(`Field added: ${id}`);
});
