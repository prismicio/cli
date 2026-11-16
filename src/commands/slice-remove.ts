import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic slice remove",
	description: "Remove a slice.",
	agents: `
		This command deletes the slice's folder, including its component. Ask the
		user before you run it.
	`,
	positionals: {
		id: { description: "ID of the slice", required: true },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals }) => {
	const [id] = positionals;

	const adapter = await getAdapter();

	await adapter.deleteSlice(id);
	await adapter.generateTypes();

	console.info(`Slice removed: ${id}`);
});
