import type { BooleanField } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getNewFieldTarget, TARGET_OPTIONS } from "../fields";
import { createCommand, exclusiveOptions, type CommandConfig } from "../lib/command";
import { addField } from "../lib/prismic/models";

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
		"default-true": { type: "boolean", description: "Default the field to true" },
		"default-false": { type: "boolean", description: "Default the field to false" },
		"true-label": { type: "string", description: "Label for true value" },
		"false-label": { type: "string", description: "Label for false value" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	exclusiveOptions(values, ["default-true", "default-false"]);
	const { label, "true-label": placeholder_true, "false-label": placeholder_false } = values;

	const { fields, fieldId, save } = await getNewFieldTarget(id, values);

	const field: BooleanField = {
		type: "Boolean",
		config: {
			label: label ?? capitalCase(fieldId),
			default_value: values["default-false"] ? false : values["default-true"],
			placeholder_true,
			placeholder_false,
		},
	};

	addField(fields, fieldId, field);
	await save();

	console.info(`Field added: ${id}`);
});
