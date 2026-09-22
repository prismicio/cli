import { capitalCase } from "change-case";

import { getNewFieldTarget, TARGET_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic field add text",
	description: `
		Add a text field to a slice or custom type.

		A text field holds a short plain string with no formatting.

		For a title or a heading, rich text limited to a single heading block
		is usually a better fit:

		  prismic field add rich-text title --to-type blog_post --allow heading1 --single

		Run \`prismic docs view fields/text\` for details.
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

export default createCommand(config, async ({ positionals: [id], values }) => {
	const { fields, fieldId, save } = await getNewFieldTarget(id, values);
	fields[fieldId] = {
		type: "Text",
		config: {
			label: values.label ?? capitalCase(fieldId),
			placeholder: values.placeholder,
		},
	};
	await save();

	console.info(`Field added: ${id}`);
});
