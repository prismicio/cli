import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveModel, TARGET_OPTIONS } from "../models";

const config = {
	name: "prismic field remove",
	description: "Remove a field from a slice or custom type.",
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: TARGET_OPTIONS,
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;

	const adapter = await getAdapter();
	const [fields, saveModel] = await resolveModel(values, { adapter });
	if (!(id in fields)) throw new CommandError(`Field "${id}" does not exist.`);
	delete fields[id];
	await saveModel();
	await adapter.generateTypes();

	console.info(`Field removed: ${id}`);
});
