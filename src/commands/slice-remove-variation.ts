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

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { from } = values;

	const adapter = await getAdapter();
	const { model: slice } = await adapter.getSlice(from);

	const variation = slice.variations.find((v) => v.id === id);
	if (!variation) {
		throw new CommandError(`Variation "${id}" not found in slice "${from}".`);
	}

	slice.variations = slice.variations.filter((v) => v.id !== variation.id);

	await adapter.updateSlice(slice);
	await adapter.generateTypes();

	console.info(`Removed variation "${id}" from slice "${from}"`);
});
