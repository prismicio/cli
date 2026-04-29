import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic type add-tab",
	description: "Add a tab to a content type.",
	positionals: {
		name: { description: "Name of the tab", required: true },
	},
	options: {
		to: { type: "string", required: true, description: "ID of the content type" },
		"with-slice-zone": { type: "boolean", description: "Add a slice zone to the tab" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { to, "with-slice-zone": withSliceZone } = values;

	const adapter = await getAdapter();
	const { model: customType } = await adapter.getCustomType(to);

	if (name in customType.json) {
		throw new CommandError(`Tab "${name}" already exists in "${to}".`);
	}

	customType.json[name] = withSliceZone
		? {
				slices: {
					type: "Slices",
					fieldset: "Slice Zone",
					config: { choices: {} },
				},
			}
		: {};

	await adapter.updateCustomType(customType);
	await adapter.generateTypes();

	console.info(`Added tab "${name}" to "${to}"`);
});
