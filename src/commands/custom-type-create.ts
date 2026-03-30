import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic custom-type create",
	description: "Create a new custom type.",
	positionals: {
		id: { description: "Custom type ID", required: true },
	},
	options: {
		name: { type: "string", short: "n", description: "Custom type name" },
		singleton: { type: "boolean", description: "Make the custom type non-repeatable" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { name = id, singleton } = values;

	const adapter = await getAdapter();

	const model: CustomType = {
		id,
		label: name,
		format: "custom",
		repeatable: !singleton,
		status: true,
		json: { Main: {} },
	};

	await adapter.createCustomType(model);
	await adapter.generateTypes();

	console.info(`Custom type created: ${id}`);
});
