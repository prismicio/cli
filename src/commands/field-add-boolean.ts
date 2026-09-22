import { capitalCase } from "change-case";

import { getNewFieldTarget, TARGET_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic field add boolean",
	description: `
		Add a boolean field to a slice or custom type.

		Run \`prismic docs view fields/boolean\` for details.
	`,
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

export default createCommand(config, async ({ positionals: [id], values }) => {
	const { fields, fieldId, save } = await getNewFieldTarget(id, values);
	fields[fieldId] = {
		type: "Boolean",
		config: {
			label: values.label ?? capitalCase(fieldId),
			default_value: values["default-value"],
			placeholder_true: values["true-label"],
			placeholder_false: values["false-label"],
		},
	};
	await save();

	console.info(`Field added: ${id}`);
});
