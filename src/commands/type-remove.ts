import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic type remove",
	description: "Remove a content type.",
	positionals: {
		id: { description: "ID of the content type", required: true },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals }) => {
	const [id] = positionals;

	const adapter = await getAdapter();
	const { model: customType } = await adapter.getCustomType(id);

	await adapter.deleteCustomType(customType.id);
	await adapter.generateTypes();

	console.info(`Type removed: ${id}`);
});
