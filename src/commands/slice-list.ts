import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";

const config = {
	name: "prismic slice list",
	description: "List local slices.",
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

	for (const slice of slices) {
		console.info(`${slice.model.id}  ${slice.model.name}`);
	}
});
