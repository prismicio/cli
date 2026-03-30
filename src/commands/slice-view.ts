import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";

const config = {
	name: "prismic slice view",
	description: "View a slice.",
	positionals: {
		id: { description: "Slice ID", required: true },
	},
	options: {
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { json } = values;

	const adapter = await getAdapter();

	let slice;
	try {
		slice = await adapter.getSlice(id);
	} catch {
		throw new CommandError(`Slice not found: ${id}`);
	}

	const { model } = slice;

	if (json) {
		console.info(stringify(model));
		return;
	}

	console.info(`ID: ${model.id}`);
	console.info(`Name: ${model.name}`);
	const variations = model.variations?.map((v) => v.id).join(", ") || "(none)";
	console.info(`Variations: ${variations}`);
});
