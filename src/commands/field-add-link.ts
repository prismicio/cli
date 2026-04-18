import type { Link } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getHost, getToken } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldTarget, resolveModel, TARGET_OPTIONS } from "../models";
import { getRepositoryName } from "../project";
import { getPostFieldAddMessage } from "./field-add";

const config = {
	name: "prismic field add link",
	description:
		"Add a link field to a slice or custom type. Use for navigational links to URLs, documents, or media. For data-level relations between documents, use content-relationship instead.",
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		allow: {
			type: "string",
			description: "Restrict to a link type: document, media, or web",
		},
		"allow-target-blank": { type: "boolean", description: "Allow opening in new tab" },
		"allow-text": { type: "boolean", description: "Allow custom link text" },
		repeatable: { type: "boolean", description: "Allow multiple links" },
		variant: { type: "string", multiple: true, description: "Allowed variant (can be repeated)" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const ALLOWED_LINK_TYPES = ["document", "media", "web"] as const;

	const {
		label,
		allow,
		"allow-target-blank": allowTargetBlank,
		"allow-text": allowText,
		repeatable: repeat,
		variant: variants,
		repo = await getRepositoryName(),
	} = values;

	if (allow && !ALLOWED_LINK_TYPES.includes(allow as (typeof ALLOWED_LINK_TYPES)[number])) {
		throw new CommandError(`--allow must be one of: ${ALLOWED_LINK_TYPES.join(", ")}`);
	}
	const select = allow as (typeof ALLOWED_LINK_TYPES)[number] | undefined;

	const token = await getToken();
	const host = await getHost();
	const [fields, saveModel, modelKind] = await resolveModel(values, { repo, token, host });
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field: Link = {
		type: "Link",
		config: {
			label: label ?? capitalCase(fieldId),
			select,
			allowTargetBlank,
			allowText,
			repeat,
			variants,
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${id}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();

	console.info(`Field added: ${id}`);

	const targetId = values["to-slice"] ?? values["to-type"]!;
	console.info(getPostFieldAddMessage({ targetId, modelKind }));
});
