import type { GeoPoint } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldTarget, resolveModel, TARGET_OPTIONS } from "../models";

const config = {
	name: "prismic field add geopoint",
	description: "Add a geopoint field to a slice or custom type.",
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { label } = values;

	const adapter = await getAdapter();
	const [fields, saveModel] = await resolveModel(values, { adapter });
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field: GeoPoint = {
		type: "GeoPoint",
		config: {
			label: label ?? capitalCase(fieldId),
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${id}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();
	await adapter.generateTypes();

	console.info(`Field added: ${id}`);
});
