import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic custom-type remove",
	description: "Remove a custom type.",
	positionals: {
		id: { description: "Custom type ID", required: true },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals }) => {
	const [id] = positionals;

	const adapter = await getAdapter();

	let customType;
	try {
		customType = await adapter.getCustomType(id);
	} catch {
		throw new CommandError(`Custom type not found: ${id}`);
	}

	if (customType.model.format === "page") {
		throw new CommandError(
			`"${id}" is a page type, not a custom type. Use \`prismic page-type remove\` instead.`,
		);
	}

	await adapter.deleteCustomType(id);
	await adapter.generateTypes();

	console.info(`Custom type removed: ${id}`);
});
