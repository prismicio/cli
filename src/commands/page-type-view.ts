import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";

const config = {
	name: "prismic page-type view",
	description: "View a page type.",
	positionals: {
		id: { description: "Page type ID", required: true },
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
		throw new CommandError(`Page type not found: ${id}`);
	}

	const { model } = customType;

	if (model.format !== "page") {
		throw new CommandError(
			`"${id}" is not a page type. Use \`prismic custom-type view\` instead.`,
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
