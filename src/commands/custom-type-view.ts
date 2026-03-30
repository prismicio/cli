import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";

const config = {
	name: "prismic custom-type view",
	description: "View a custom type.",
	positionals: {
		id: { description: "Custom type ID", required: true },
	},
	options: {
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { json } = values;

	const adapter = await getAdapter();

	let customType;
	try {
		customType = await adapter.getCustomType(id);
	} catch {
		throw new CommandError(`Custom type not found: ${id}`);
	}

	const { model } = customType;

	if (model.format === "page") {
		throw new CommandError(
			`"${id}" is a page type, not a custom type. Use \`prismic page-type view\` instead.`,
		);
	}

	if (json) {
		console.info(stringify(model));
		return;
	}

	console.info(`ID: ${model.id}`);
	console.info(`Name: ${model.label || "(no name)"}`);
	console.info(`Repeatable: ${model.repeatable}`);
	const tabs = Object.keys(model.json).join(", ") || "(none)";
	console.info(`Tabs: ${tabs}`);
});
