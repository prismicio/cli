import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic slice edit",
	description: "Edit a slice.",
	positionals: {
		id: { description: "ID of the slice", required: true },
	},
	options: {
		name: { type: "string", short: "n", description: "New name for the slice" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;

	const adapter = await getAdapter();
	const { model: slice } = await adapter.getSlice(id);

	if ("name" in values) slice.name = values.name!;

	await adapter.updateSlice(slice);
	await adapter.generateTypes();

	console.info(`Slice updated: "${slice.name}" (id: ${slice.id})`);
});
