import { capitalCase } from "change-case";

import { getNewFieldTarget, parseNumber, TARGET_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic field add number",
	description: `
		Add a number field to a slice or custom type.

		Run \`prismic docs view fields/number\` for details.
	`,
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

export default createCommand(config, async ({ positionals: [id], values }) => {
	const min = parseNumber(values.min, "min");
	const max = parseNumber(values.max, "max");
	const step = parseNumber(values.step, "step");

	const { fields, fieldId, save } = await getNewFieldTarget(id, values);
	fields[fieldId] = {
		type: "Number",
		config: {
			label: values.label ?? capitalCase(fieldId),
			placeholder: values.placeholder,
			min,
			max,
			step,
		},
	};
	await save();

	console.info(`Field added: ${id}`);
});
