import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { formatTable } from "../lib/string";

const config = {
	name: "prismic slice list",
	description: "List all slices.",
	options: {
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { json } = values;

	const adapter = await getAdapter();
	const slices = await adapter.getSlices();

	if (json) {
		console.info(stringify(slices.map((s) => s.model)));
		return;
	}

	if (slices.length === 0) {
		console.info("No slices found.");
		return;
	}

	const rows = slices.map(({ model }) => [model.name, model.id]);
	console.info(formatTable(rows, { headers: ["NAME", "ID"] }));
});
