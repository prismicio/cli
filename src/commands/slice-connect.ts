import type { DynamicWidget } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic slice connect",
	description: "Connect a slice to a type's slice zone.",
	sections: {
		EXAMPLES: `
			Connect a slice to a type's default slice zone:
			  prismic slice connect hero --to blog_post

			Connect to a named slice zone:
			  prismic slice connect hero --to blog_post --slice-zone page_slices
		`,
	},
	positionals: {
		id: { description: "ID of the slice", required: true },
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
	const [id] = positionals;
	const { to, "slice-zone": sliceZone = "slices" } = values;

	const adapter = await getAdapter();
	const { model: slice } = await adapter.getSlice(id);
	const { model: customType } = await adapter.getCustomType(to);

	const allFields: Record<string, DynamicWidget> = Object.assign(
		{},
		...Object.values(customType.json),
	);

	const sliceZoneField = allFields[sliceZone];
	if (!sliceZoneField || sliceZoneField.type !== "Slices") {
		throw new CommandError(`Slice zone "${sliceZone}" not found in "${to}".`);
	}

	sliceZoneField.config ??= {};
	sliceZoneField.config.choices ??= {};

	if (slice.id in sliceZoneField.config.choices) {
		throw new CommandError(
			`Slice "${slice.id}" is already connected to "${to}" in slice zone "${sliceZone}".`,
		);
	}

	sliceZoneField.config.choices[slice.id] = { type: "SharedSlice" };

	await adapter.updateCustomType(customType);
	await adapter.generateTypes();

	console.info(`Connected slice "${id}" to "${to}"`);
});
