import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";

const config = {
	name: "prismic custom-type list",
	description: "List local custom types.",
	options: {
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { json } = values;

	const adapter = await getAdapter();
	const customTypes = await adapter.getCustomTypes();
	const filtered = customTypes.filter(
		(ct) => ct.model.format === "custom" || !ct.model.format,
	);

	if (json) {
		console.info(stringify(filtered.map((ct) => ct.model)));
		return;
	}

	if (filtered.length === 0) {
		console.info("No custom types found.");
		return;
	}

	for (const ct of filtered) {
		const label = ct.model.label || "(no name)";
		console.info(`${ct.model.id}  ${label}`);
	}
});
