import type { Table } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveModel, TARGET_OPTIONS } from "../models";

const config = {
	name: "prismic field add table",
	description: "Add a table field to a slice or custom type.",
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
	const { label = capitalCase(id) } = values;

	const field: Table = {
		type: "Table",
		config: {
			label,
		},
	};

	const adapter = await getAdapter();
	const [fields, saveModel] = await resolveModel(values, { adapter });
	if (id in fields) throw new CommandError(`Field "${id}" already exists.`);
	fields[id] = field;
	await saveModel();
	await adapter.generateTypes();

	console.info(`Field added: ${id}`);
});
