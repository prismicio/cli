import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { pascalCase } from "change-case";

import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic slice create",
	description: "Create a new slice.",
	positionals: {
		id: { description: "Slice ID", required: true },
	},
	options: {
		name: { type: "string", short: "n", description: "Slice name" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { name = pascalCase(id) } = values;

	const adapter = await getAdapter();

	const model: SharedSlice = {
		id,
		type: "SharedSlice",
		name,
		variations: [
			{
				id: "default",
				name: "Default",
				description: "Default",
				docURL: "",
				version: "",
				imageUrl: "",
				primary: {},
			},
		],
	};

	await adapter.createSlice(model);
	await adapter.generateTypes();

	console.info(`Slice created: ${id}`);
});
