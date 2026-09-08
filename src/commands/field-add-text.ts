import type { Text } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getNewFieldTarget, TARGET_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";
import { addField } from "../lib/prismic/models";

const config = {
	name: "prismic field add text",
	description: `
		Add a key text field to a slice or custom type.

		Key text is a short plain string with no formatting, which makes it a
		good fit for names, usernames, and labels.

		For a title or a heading, rich text limited to a single heading block
		is usually a better fit:

		  prismic field add rich-text title --to-type blog_post --allow heading1 --single
	`,
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { label, placeholder } = values;

	const { fields, fieldId, save } = await getNewFieldTarget(id, values);

	const field: Text = {
		type: "Text",
		config: {
			label: label ?? capitalCase(fieldId),
			placeholder,
		},
	};

	addField(fields, fieldId, field);
	await save();

	console.info(`Field added: ${id}`);
});
