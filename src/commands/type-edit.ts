import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic type edit",
	description: "Edit a content type.",
	positionals: {
		id: { description: "ID of the content type", required: true },
	},
	options: {
		name: { type: "string", short: "n", description: "New name for the type" },
		format: { type: "string", short: "f", description: 'Type format: "custom" or "page"' },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;

	if ("format" in values && values.format !== "custom" && values.format !== "page") {
		throw new CommandError(`Invalid format: "${values.format}". Use "custom" or "page".`);
	}

	const adapter = await getAdapter();
	const { model: customType } = await adapter.getCustomType(id);

	if ("name" in values) customType.label = values.name;
	if ("format" in values) customType.format = values.format as "custom" | "page";

	await adapter.updateCustomType(customType);
	await adapter.generateTypes();

	console.info(`Type updated: "${customType.label}" (id: ${customType.id})`);
});
