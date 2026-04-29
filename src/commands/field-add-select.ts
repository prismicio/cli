import type { Select } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import {
	getPostFieldAddMessage,
	resolveFieldTarget,
	resolveModel,
	TARGET_OPTIONS,
} from "../models";

const config = {
	name: "prismic field add select",
	description: "Add a select field to a slice or custom type.",
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
	const {
		label,
		placeholder,
		"default-value": default_value,
		option: options,
	} = values;

	const [fields, saveModel, modelKind] = await resolveModel(values);
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field: Select = {
		type: "Select",
		config: {
			label: label ?? capitalCase(fieldId),
			placeholder,
			default_value,
			options,
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${id}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();

	console.info(`Field added: ${id}`);

	const targetId = values["to-slice"] ?? values["to-type"]!;
	console.info(getPostFieldAddMessage({ targetId, modelKind }));
});
