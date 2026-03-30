import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic page-type remove",
	description: "Remove a page type.",
	positionals: {
		id: { description: "Page type ID", required: true },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals }) => {
	const [id] = positionals;

	const adapter = await getAdapter();

	let customType;
	try {
		customType = await adapter.getCustomType(id);
	} catch {
		throw new CommandError(`Page type not found: ${id}`);
	}

	if (customType.model.format !== "page") {
		throw new CommandError(
			`"${id}" is not a page type. Use \`prismic custom-type remove\` instead.`,
		);
	}

	await adapter.deleteCustomType(id);
	await adapter.generateTypes();

	console.info(`Page type removed: ${id}`);
});
