import type { Date as DateField } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getHost, getToken } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldTarget, resolveModel, TARGET_OPTIONS } from "../models";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic field add date",
	description: "Add a date field to a slice or custom type.",
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
		default: { type: "string", description: "Default value" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { label, placeholder, default: defaultValue, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const [fields, saveModel] = await resolveModel(values, { repo, token, host });
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field: DateField = {
		type: "Date",
		config: {
			label: label ?? capitalCase(fieldId),
			placeholder,
			default: defaultValue,
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${id}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();

	console.info(`Field added: ${id}`);
});
