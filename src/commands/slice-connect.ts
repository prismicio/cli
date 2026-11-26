import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { connectSlices } from "../slices";

const config = {
	name: "prismic slice connect",
	description: "Connect slices to a type's slice zone.",
	sections: {
		EXAMPLES: `
			Connect a slice to a type's default slice zone:
			  prismic slice connect hero --to blog_post

			Connect several slices at once:
			  prismic slice connect hero features cta --to blog_post

			Connect to a named slice zone:
			  prismic slice connect hero --to blog_post --slice-zone page_slices
		`,
	},
	positionals: {
		id: { description: "IDs of the slices", required: true, multiple: true },
	},
	options: {
		to: {
			type: "string",
			required: true,
			description: "ID of the content type",
		},
		"slice-zone": {
			type: "string",
			description: 'Slice zone field ID (default: "slices")',
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const ids = new Set(positionals);
	const { to, "slice-zone": sliceZone = "slices" } = values;

	const adapter = await getAdapter();
	for (const id of ids) await adapter.getSlice(id);
	const { model: customType } = await adapter.getCustomType(to);
	connectSlices(customType, sliceZone, ids);

	await adapter.updateCustomType(customType);
	await adapter.generateTypes();

	for (const id of ids) {
		console.info(`Connected slice "${id}" to "${to}"`);
	}
});
