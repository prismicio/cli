import { capitalCase } from "change-case";

import { getNewFieldTarget, TARGET_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic field add table",
	description: `
		Add a table field to a slice or custom type.

		Run \`prismic docs view fields/table\` for details.
	`,
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals: [id], values }) => {
	const { fields, fieldId, save } = await getNewFieldTarget(id, values);
	fields[fieldId] = {
		type: "Table",
		config: {
			label: values.label ?? capitalCase(fieldId),
		},
	};
	await save();

	console.info(`Field added: ${id}`);
});
