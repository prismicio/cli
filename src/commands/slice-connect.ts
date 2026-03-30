import type { DynamicWidget } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveCustomType } from "../models";

const config = {
	name: "prismic slice connect",
	description: "Connect a slice to a type's slice zone.",
	positionals: {
		id: { description: "Slice ID", required: true },
	},
	options: {
		to: {
			type: "string",
			required: true,
			description: "Relative path to the page type or custom type model",
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

	// Verify the slice exists.
	try {
		await adapter.getSlice(id);
	} catch {
		throw new CommandError(`Slice not found: ${id}`);
	}

	const customType = await resolveCustomType(to, { adapter });
	const allFields: Record<string, DynamicWidget> = Object.assign(
		{},
		...Object.values(customType.model.json),
	);

	const slices = allFields[sliceZone];
	if (!slices || slices.type !== "Slices") {
		throw new CommandError(`Slice zone "${sliceZone}" not found in "${to}".`);
	}

	slices.config ??= {};
	slices.config.choices ??= {};

	if (id in slices.config.choices) {
		throw new CommandError(
			`Slice "${id}" is already connected to "${to}" in slice zone "${sliceZone}".`,
		);
	}

	slices.config.choices[id] = { type: "SharedSlice" };

	await adapter.updateCustomType(customType.model);
	await adapter.generateTypes();

	console.info(`Slice connected: ${id} -> ${to}`);
});
