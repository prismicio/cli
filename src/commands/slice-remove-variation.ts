import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic slice remove-variation",
	description: "Remove a variation from a slice.",
	positionals: {
		id: { description: "ID of the variation", required: true },
	},
	options: {
		from: { type: "string", required: true, description: "ID of the slice" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals: [id], values }) => {
	const { from } = values;

	const adapter = await getAdapter();
	const { model: slice } = await adapter.getSlice(from);

	if (!slice.variations.some((v) => v.id === id)) {
		throw new CommandError(`Variation "${id}" not found in slice "${from}".`);
	}

	slice.variations = slice.variations.filter((v) => v.id !== id);

	await adapter.updateSlice(slice);
	await adapter.generateTypes();

	console.info(`Removed variation "${id}" from slice "${from}"`);
});
