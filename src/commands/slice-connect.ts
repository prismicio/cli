import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getSliceZoneChoices } from "../slices";

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
	const { model: customType } = await adapter.getCustomType(to);
	const choices = getSliceZoneChoices(customType, sliceZone);

	for (const id of ids) {
		const { model: slice } = await adapter.getSlice(id);
		if (slice.id in choices) {
			throw new CommandError(
				`Slice "${slice.id}" is already connected to "${to}" in slice zone "${sliceZone}".`,
			);
		}
		choices[slice.id] = { type: "SharedSlice" };
	}

	await adapter.updateCustomType(customType);
	await adapter.generateTypes();

	for (const id of ids) {
		console.info(`Connected slice "${id}" to "${to}"`);
	}
});
