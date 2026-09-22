import { getAdapter } from "../adapters";
import { formatFieldTable } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";

const config = {
	name: "prismic slice view",
	description: "View details of a slice.",
	positionals: {
		id: { description: "ID of the slice", required: true },
	},
	options: {
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals: [id], values }) => {
	const adapter = await getAdapter();
	const { model: slice } = await adapter.getSlice(id);

	if (values.json) {
		console.info(stringify(slice));
		return;
	}

	console.info(`ID: ${slice.id}`);
	console.info(`Name: ${slice.name}`);

	for (const variation of slice.variations ?? []) {
		console.info("");
		console.info(`${variation.id}:`);
		console.info(formatFieldTable(variation.primary ?? {}));
	}
});
