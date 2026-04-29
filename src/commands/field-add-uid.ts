import type { UID } from "@prismicio/types-internal/lib/customtypes";

import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getPostFieldAddMessage, resolveModel } from "../models";

const config = {
	name: "prismic field add uid",
	description: "Add a UID field to a content type.",
	options: {
		"to-type": { type: "string", description: "Name of the target content type" },
		tab: { type: "string", description: 'Content type tab name (default: "Main")' },
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { label = "UID", placeholder } = values;

	const [fields, saveModel, modelKind] = await resolveModel(values);

	const field: UID = {
		type: "UID",
		config: {
			label,
			placeholder,
		},
	};

	if ("uid" in fields) throw new CommandError('Field "uid" already exists.');
	fields.uid = field;
	await saveModel();

	console.info("Field added: uid");

	const targetId = values["to-type"]!;
	console.info(getPostFieldAddMessage({ targetId, modelKind }));
});
