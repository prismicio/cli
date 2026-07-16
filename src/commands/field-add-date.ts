import type { Date as DateField } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getNewFieldTarget, TARGET_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";
import { addField } from "../lib/prismic/models";

const config = {
	name: "prismic field add date",
	description: "Add a date field to a slice or custom type.",
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

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { label, placeholder, default: defaultValue } = values;

	const { fields, fieldId, save } = await getNewFieldTarget(id, values);

	const field: DateField = {
		type: "Date",
		config: {
			label: label ?? capitalCase(fieldId),
			placeholder,
			default: defaultValue,
		},
	};

	addField(fields, fieldId, field);
	await save();

	console.info(`Field added: ${id}`);
});
