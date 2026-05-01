import type { DynamicWidget } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic slice disconnect",
	description: "Disconnect a slice from a type's slice zone.",
	positionals: {
		id: { description: "ID of the slice", required: true },
	},
	options: {
		from: {
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
	const { from, "slice-zone": sliceZone = "slices" } = values;

	const adapter = await getAdapter();
	const { model: slice } = await adapter.getSlice(id);
	const { model: customType } = await adapter.getCustomType(from);

	const allFields: Record<string, DynamicWidget> = Object.assign(
		{},
		...Object.values(customType.json),
	);

	const sliceZoneField = allFields[sliceZone];
	if (!sliceZoneField || sliceZoneField.type !== "Slices") {
		throw new CommandError(`Slice zone "${sliceZone}" not found in "${from}".`);
	}

	if (!sliceZoneField.config?.choices || !(slice.id in sliceZoneField.config.choices)) {
		throw new CommandError(
			`Slice "${slice.id}" is not connected to "${from}" in slice zone "${sliceZone}".`,
		);
	}

	delete sliceZoneField.config.choices[slice.id];

	await adapter.updateCustomType(customType);
	await adapter.generateTypes();

	console.info(`Disconnected slice "${id}" from "${from}"`);
});
