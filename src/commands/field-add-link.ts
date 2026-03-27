import type { Link } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveModel, TARGET_OPTIONS } from "./field";

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
		label = capitalCase(id),
		"allow-target-blank": allowTargetBlank,
		"allow-text": allowText,
		repeatable: repeat,
		variant: variants,
	} = values;

	const field: Link = {
		type: "Link",
		config: {
			label,
			allowTargetBlank,
			allowText,
			repeat,
			variants,
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
