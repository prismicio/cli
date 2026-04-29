import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldContainer, resolveFieldTarget, SOURCE_OPTIONS } from "../models";

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

	const [fields, saveModel] = await resolveFieldContainer(id, values);
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);
	if (!(fieldId in targetFields)) throw new CommandError(`Field "${id}" does not exist.`);
	delete targetFields[fieldId];
	await saveModel();

	console.info(`Field removed: ${id}`);
});
