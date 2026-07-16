import type { UID } from "@prismicio/types-internal/lib/customtypes";

import { getNewFieldTarget, TARGET_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";
import { addField } from "../lib/prismic/models";

const config = {
	name: "prismic field add uid",
	description: "Add a UID field to a content type.",
	options: {
		"to-type": TARGET_OPTIONS["to-type"],
		tab: TARGET_OPTIONS.tab,
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { label = "UID", placeholder } = values;

	const { fields, fieldId, save } = await getNewFieldTarget("uid", values);

	const field: UID = {
		type: "UID",
		config: {
			label,
			placeholder,
		},
	};

	addField(fields, fieldId, field);
	await save();

	console.info("Field added: uid");
});
