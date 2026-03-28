import type { RichText } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveModel, TARGET_OPTIONS } from "../models";

const config = {
	name: "prismic field add rich-text",
	description: "Add a rich text field to a slice or custom type.",
	sections: {
		BLOCKS: `
			heading1, heading2, heading3, heading4, heading5, heading6,
			paragraph, strong, em, preformatted, hyperlink, image, embed,
			list-item, o-list-item, rtl`,
	},
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
		allow: {
			type: "string",
			description: "Comma-separated allowed block types (e.g. heading1,heading2,paragraph)",
		},
		single: { type: "boolean", description: "Restrict to a single block" },
		"allow-target-blank": { type: "boolean", description: "Allow opening links in new tab" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const {
		label = capitalCase(id),
		placeholder,
		allow,
		single: isSingle,
		"allow-target-blank": allowTargetBlank,
	} = values;

	const field: RichText = {
		type: "StructuredText",
		config: {
			label,
			placeholder,
			...(isSingle ? { single: allow } : { multi: allow }),
			allowTargetBlank,
		},
	};

	const adapter = await getAdapter();
	const [fields, saveModel] = await resolveModel(values, { adapter });
	if (id in fields) throw new CommandError(`Field "${id}" already exists.`);
	fields[id] = field;
	await saveModel();
	await adapter.generateTypes();

	console.info(`Field added: ${id}`);
});
