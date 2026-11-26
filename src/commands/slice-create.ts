import type { SharedSliceModel } from "@prismicio/types-internal";
import { snakeCase } from "change-case";

import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { connectSlices } from "../slices";

const config = {
	name: "prismic slice create",
	description: "Create a new slice.",
	sections: {
		EXAMPLES: `
			Create a slice:
			  prismic slice create "Call To Action"

			Create a slice and connect it to a type's default slice zone:
			  prismic slice create Hero --to blog_post
		`,
	},
	positionals: {
		name: { description: "Name of the slice", required: true },
	},
	options: {
		id: { type: "string", description: "Custom ID for the slice" },
		to: { type: "string", description: "ID of a content type to connect the slice to" },
		"slice-zone": {
			type: "string",
			dependsOn: "to",
			description: 'Slice zone field ID (default: "slices")',
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { id = snakeCase(name), to, "slice-zone": sliceZone = "slices" } = values;

	const model: SharedSliceModel = {
		id,
		name,
		type: "SharedSlice",
		variations: [
			{
				id: "default",
				name: "Default",
				description: "Default",
				docURL: "",
				imageUrl: "",
				version: "",
				primary: {},
			},
		],
	};

	const adapter = await getAdapter();
	const customType = to ? (await adapter.getCustomType(to)).model : undefined;
	if (customType) connectSlices(customType, sliceZone, [id]);

	await adapter.createSlice(model);
	if (customType) await adapter.updateCustomType(customType);
	await adapter.generateTypes();

	console.info(`Created slice "${name}" (id: "${id}")`);
	console.info(`Run \`prismic field add <type> <field_id> --to-slice ${id}\` to add fields.`);
	if (to) {
		console.info(`Connected slice "${id}" to "${to}"`);
	} else {
		console.info(`Run \`prismic slice connect ${id} --to <type>\` to connect the slice to a type.`);
	}
});
