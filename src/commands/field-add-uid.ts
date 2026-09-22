import { getNewFieldTarget, TARGET_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic field add uid",
	description: `
		Add a UID field to a content type.

		Run \`prismic docs view fields/uid\` for details.
	`,
	options: {
		"to-type": TARGET_OPTIONS["to-type"],
		tab: TARGET_OPTIONS.tab,
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { fields, fieldId, save } = await getNewFieldTarget("uid", values);
	fields[fieldId] = {
		type: "UID",
		config: {
			label: values.label ?? "UID",
			placeholder: values.placeholder,
		},
	};
	await save();

	console.info("Field added: uid");
});
