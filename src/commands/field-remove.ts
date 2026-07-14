import { getExistingField, SOURCE_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic field remove",
	description: "Remove a field from a slice or custom type.",
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: SOURCE_OPTIONS,
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;

	const { fields, fieldId, save } = await getExistingField(id, values);
	delete fields[fieldId];
	await save();

	console.info(`Field removed: ${id}`);
});
