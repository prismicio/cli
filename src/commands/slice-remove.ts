import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic slice remove",
	description: "Remove a slice.",
	positionals: {
		id: { description: "ID of the slice", required: true },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals }) => {
	const [id] = positionals;

	const adapter = await getAdapter();
	const { model: slice } = await adapter.getSlice(id);

	await adapter.deleteSlice(slice.id);
	await adapter.generateTypes();

	console.info(`Slice removed: ${id}`);
});
