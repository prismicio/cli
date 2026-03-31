import type { Link } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getHost, getToken } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldTarget, resolveModel, TARGET_OPTIONS } from "../models";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic field add link-to-media",
	description: "Add a link to media field to a slice or custom type.",
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		"allow-text": { type: "boolean", description: "Allow custom link text" },
		variant: { type: "string", multiple: true, description: "Allowed variant (can be repeated)" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const {
		label,
		"allow-text": allowText,
		variant: variants,
		repo = await getRepositoryName(),
	} = values;

	const token = await getToken();
	const host = await getHost();
	const [fields, saveModel] = await resolveModel(values, { repo, token, host });
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field: Link = {
		type: "Link",
		config: {
			label: label ?? capitalCase(fieldId),
			select: "media",
			allowText,
			variants,
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${id}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();

	console.info(`Field added: ${id}`);
});
