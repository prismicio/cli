import type { TableModel } from "@prismicio/types-internal";
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

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { label } = values;

	const { fields, fieldId, save } = await getNewFieldTarget(id, values);

	const field: TableModel = {
		type: "Table",
		config: {
			label: label ?? capitalCase(fieldId),
		},
	};

	fields[fieldId] = field;
	await save();

	console.info(`Field added: ${id}`);
});
