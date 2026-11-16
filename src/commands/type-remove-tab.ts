import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic type remove-tab",
	description: "Remove a tab from a content type.",
	agents: `
		This command removes a tab and all its fields from a content type. Unless the
		user asked to force it, ask before you run it.
	`,
	positionals: {
		name: { description: "Name of the tab", required: true },
	},
	options: {
		from: { type: "string", required: true, description: "ID of the content type" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { from } = values;

	const adapter = await getAdapter();
	const { model: customType } = await adapter.getCustomType(from);

	if (!(name in customType.json)) {
		throw new CommandError(`Tab "${name}" not found in "${from}".`);
	}

	if (Object.keys(customType.json).length <= 1) {
		throw new CommandError(`Cannot remove the last tab from "${from}".`);
	}

	delete customType.json[name];

	await adapter.updateCustomType(customType);
	await adapter.generateTypes();

	console.info(`Removed tab "${name}" from "${from}"`);
});
