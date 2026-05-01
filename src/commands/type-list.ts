import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { formatTable } from "../lib/string";

const config = {
	name: "prismic type list",
	description: "List all content types.",
	options: {
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { json } = values;

	const adapter = await getAdapter();
	const types = await adapter.getCustomTypes();

	if (json) {
		console.info(stringify(types.map((t) => t.model)));
		return;
	}

	if (types.length === 0) {
		console.info("No types found.");
		return;
	}

	const rows = types.map(({ model }) => {
		const label = model.label || "(no name)";
		return [label, model.id, model.format ?? ""];
	});
	console.info(formatTable(rows, { headers: ["NAME", "ID", "FORMAT"] }));
});
