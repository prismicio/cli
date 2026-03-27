import type { Number as NumberField } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveModel, TARGET_OPTIONS } from "../models";

const config = {
	name: "prismic field add number",
	description: "Add a number field to a slice or custom type.",
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
		min: { type: "string", description: "Minimum value" },
		max: { type: "string", description: "Maximum value" },
		step: { type: "string", description: "Step increment" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { label = capitalCase(id), placeholder } = values;

	const min = parseNumber(values.min, "min");
	const max = parseNumber(values.max, "max");
	const step = parseNumber(values.step, "step");

	const field: NumberField = {
		type: "Number",
		config: {
			label,
			placeholder,
			min,
			max,
			step,
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

function parseNumber(value: string | undefined, optionName: string): number | undefined {
	if (value === undefined) return undefined;
	const number = Number.parseInt(value);
	if (Number.isNaN(number)) {
		throw new CommandError(`--${optionName} must be a valid number, got "${value}"`);
	}
	return number;
}
