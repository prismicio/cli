import type { Number as NumberField } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getHost, getToken } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldTarget, resolveModel, TARGET_OPTIONS } from "../models";
import { getRepositoryName } from "../project";
import { getPostFieldAddMessage } from "./field-add";

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
	const { label, placeholder, repo = await getRepositoryName() } = values;

	const min = parseNumber(values.min, "min");
	const max = parseNumber(values.max, "max");
	const step = parseNumber(values.step, "step");

	const token = await getToken();
	const host = await getHost();
	const [fields, saveModel, modelKind] = await resolveModel(values, { repo, token, host });
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field: NumberField = {
		type: "Number",
		config: {
			label: label ?? capitalCase(fieldId),
			placeholder,
			min,
			max,
			step,
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${id}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();

	console.info(`Field added: ${id}`);

	const targetId = values["to-slice"] ?? values["to-type"]!;
	console.info(getPostFieldAddMessage({ targetId, modelKind }));
});

function parseNumber(value: string | undefined, optionName: string): number | undefined {
	if (value === undefined) return undefined;
	const number = Number(value);
	if (Number.isNaN(number)) {
		throw new CommandError(`--${optionName} must be a valid number, got "${value}"`);
	}
	return number;
}
