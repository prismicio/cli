import type { UID } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveModel, TARGET_OPTIONS } from "../models";

const config = {
	name: "prismic field add uid",
	description: "Add a UID field to a custom type.",
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { label = "UID", placeholder } = values;

	const field: UID = {
		type: "UID",
		config: {
			label,
			placeholder,
		},
	};

	const adapter = await getAdapter();
	const [fields, saveModel] = await resolveModel(values, {
		adapter,
		targetType: "customType",
	});
	if ("uid" in fields) throw new CommandError('Field "uid" already exists.');
	fields.uid = field;
	await saveModel();
	await adapter.generateTypes();

	console.info("Field added: uid");
});
