import type { Group } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getNewFieldTarget, TARGET_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";
import { addField } from "../lib/prismic/models";

const config = {
	name: "prismic field add group",
	description: "Add a group field to a slice or custom type.",
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

	const field: Group = {
		type: "Group",
		config: {
			label: label ?? capitalCase(fieldId),
		},
	};

	addField(fields, fieldId, field);
	await save();

	console.info(`Field added: ${id}`);
});
