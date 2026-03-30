import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";

const config = {
	name: "prismic page-type list",
	description: "List local page types.",
	options: {
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { json } = values;

	const adapter = await getAdapter();
	const customTypes = await adapter.getCustomTypes();
	const pageTypes = customTypes.filter((ct) => ct.model.format === "page");

	if (json) {
		console.info(stringify(pageTypes.map((ct) => ct.model)));
		return;
	}

	if (pageTypes.length === 0) {
		console.info("No page types found.");
		return;
	}

	for (const ct of pageTypes) {
		const label = ct.model.label || "(no name)";
		console.info(`${ct.model.id}  ${label}`);
	}
});
