import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic slice remove",
	description: "Remove a slice.",
	positionals: {
		id: { description: "Slice ID", required: true },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals }) => {
	const [id] = positionals;

	const adapter = await getAdapter();

	try {
		await adapter.deleteSlice(id);
	} catch {
		throw new CommandError(`Slice not found: ${id}`);
	}

	await adapter.generateTypes();

	console.info(`Slice removed: ${id}`);
});
