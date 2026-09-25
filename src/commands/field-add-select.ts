import type { SelectModel } from "@prismicio/types-internal";
import { capitalCase } from "change-case";

import { getNewFieldTarget, TARGET_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic field add select",
	description: `
		Add a select field to a slice or custom type.

		Run \`prismic docs view fields/select\` for details.
	`,
	sections: {
		EXAMPLES: `
			Add a select with options:
			  prismic field add select theme --to-type landing_page --option light --option dark --option brand

			With a default value:
			  prismic field add select layout --to-type landing_page --option full --option centered --option sidebar --default-value full
		`,
	},
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
		"default-value": { type: "string", description: "Default selected value" },
		option: {
			type: "string",
			multiple: true,
			description: "Select option value (can be repeated)",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { label, placeholder, "default-value": default_value, option: options } = values;

	const { fields, fieldId, save } = await getNewFieldTarget(id, values);

	const field: SelectModel = {
		type: "Select",
		config: {
			label: label ?? capitalCase(fieldId),
			placeholder,
			default_value,
			options,
		},
	};

	fields[fieldId] = field;
	await save();

	console.info(`Field added: ${id}`);
});
