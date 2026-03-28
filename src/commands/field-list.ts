import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { resolveModel, SOURCE_OPTIONS } from "../models";

const config = {
	name: "prismic field list",
	description: "List fields in a slice or custom type.",
	options: {
		...SOURCE_OPTIONS,
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const adapter = await getAdapter();
	const [rawFields] = await resolveModel(values, { adapter });

	const fields = Object.entries(rawFields).map(([id, field]) => {
		return {
			id,
			type: field.type,
			label: field.config?.label || undefined,
		};
	});

	if (values.json) {
		console.info(stringify(fields));
		return;
	}

	if (fields.length === 0) {
		console.info("No fields found.");
		return;
	}

	for (const field of fields) {
		const label = field.label ? `  ${field.label}` : "";
		console.info(`${field.id}  ${field.type}${label}`);
	}
});
