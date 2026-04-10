import type { Link } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getHost, getToken } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldTarget, resolveModel, TARGET_OPTIONS } from "../models";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic field add content-relationship",
	description: `
		Add a content relationship field to a slice or custom type.

		Content relationships fetch and display data from related documents
		(e.g. an author's name, a category's label). They are not navigational
		links -- use the link field type for URLs, documents, or media that
		the user clicks to visit.

		Use --custom-type and --tag to restrict which documents can be
		selected. These filters define exactly which documents are queryable
		through this field. If neither is specified, all documents are allowed.
	`,
	sections: {
		"FIELD CONSTRAINTS": `
			--custom-type and --tag narrow which documents editors can select
			and which documents the API returns for this field. Adding or
			removing a custom type or tag that is referenced by an existing
			content relationship changes which documents are queryable -- any
			code that depends on a specific document type being returned may
			break if that type is removed from the constraint list.
		`,
	},
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		tag: { type: "string", multiple: true, description: "Restrict to documents with this tag (can be repeated)" },
		"custom-type": {
			type: "string",
			multiple: true,
			description: "Restrict to documents of this type (can be repeated)",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { label, tag: tags, "custom-type": customtypes, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const [fields, saveModel] = await resolveModel(values, { repo, token, host });
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field: Link = {
		type: "Link",
		config: {
			label: label ?? capitalCase(fieldId),
			select: "document",
			tags,
			customtypes,
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${id}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();

	console.info(`Field added: ${id}`);
});
