import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { formatTable } from "../lib/string";

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

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { json } = values;

	const adapter = await getAdapter();
	const { model: slice } = await adapter.getSlice(id);

	if (json) {
		console.info(stringify(slice));
		return;
	}

	console.info(`ID: ${slice.id}`);
	console.info(`Name: ${slice.name}`);

	for (const variation of slice.variations ?? []) {
		console.info("");
		console.info(`${variation.id}:`);
		const entries = Object.entries(variation.primary ?? {});
		if (entries.length === 0) {
			console.info("  (no fields)");
		} else {
			const rows = entries.map(([id, field]) => {
				const config = field.config as Record<string, unknown> | undefined;
				const label = (config?.label as string) || "";
				const placeholder = config?.placeholder ? `"${config.placeholder}"` : "";
				return [`  ${id}`, field.type, label, placeholder];
			});
			console.info(formatTable(rows));
		}
	}
});
