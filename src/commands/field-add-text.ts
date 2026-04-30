import type { Text } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import {
	getPostFieldAddMessage,
	resolveFieldTarget,
	resolveModel,
	TARGET_OPTIONS,
} from "../models";

const config = {
	name: "prismic field add text",
	description: "Add a text field to a slice or custom type.",
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { label, placeholder } = values;

	const [fields, saveModel, modelKind] = await resolveModel(values);
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field: Text = {
		type: "Text",
		config: {
			label: label ?? capitalCase(fieldId),
			placeholder,
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${id}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();

	console.info(`Field added: ${id}`);

	const targetId = values["to-slice"] ?? values["to-type"]!;
	console.info(getPostFieldAddMessage({ targetId, modelKind }));
});
