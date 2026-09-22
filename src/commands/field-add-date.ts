import { capitalCase } from "change-case";

import { getNewFieldTarget, TARGET_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic field add date",
	description: `
		Add a date field to a slice or custom type.

		Run \`prismic docs view fields/date\` for details.
	`,
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
		default: { type: "string", description: "Default value" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals: [id], values }) => {
	const { fields, fieldId, save } = await getNewFieldTarget(id, values);
	fields[fieldId] = {
		type: "Date",
		config: {
			label: values.label ?? capitalCase(fieldId),
			placeholder: values.placeholder,
			default: values.default,
		},
	};
	await save();

	console.info(`Field added: ${id}`);
});
