import type { Link } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import {
	getPostFieldAddMessage,
	resolveFieldSelection,
	resolveFieldTarget,
	resolveModel,
	TARGET_OPTIONS,
} from "../models";

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
		"FETCHED FIELDS": `
			By default, a content relationship only returns the linked
			document's metadata (ID, type, tags). Use --field to fetch
			specific fields from the related document so you can display
			them without a separate query.

			--field requires exactly one --custom-type. Dot notation is
			supported for fields inside groups (e.g. --field
			authors.name).
		`,
		EXAMPLES: `
			Allow any document:
			  prismic field add content-relationship author --to-type blog_post

			Restrict to a specific type:
			  prismic field add content-relationship category --to-type blog_post --custom-type blog_category

			Fetch fields from the related document:
			  prismic field add content-relationship author --to-type blog_post --custom-type author --field name --field bio
		`,
	},
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		tag: {
			type: "string",
			multiple: true,
			description: "Restrict to documents with this tag (can be repeated)",
		},
		"custom-type": {
			type: "string",
			multiple: true,
			description: "Restrict to documents of this type (can be repeated)",
		},
		field: {
			type: "string",
			multiple: true,
			description:
				"Fetch this field from the related document (can be repeated, requires one --custom-type)",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { label, tag: tags, "custom-type": customtypes, field: fieldSelection } = values;

	if (fieldSelection && (!customtypes || customtypes.length !== 1)) {
		throw new CommandError("--field requires exactly one --custom-type.");
	}

	const [fields, saveModel, modelKind] = await resolveModel(values);
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	let resolvedCustomTypes: NonNullable<Link["config"]>["customtypes"] = customtypes;
	if (fieldSelection && customtypes) {
		const resolvedFields = await resolveFieldSelection(fieldSelection, customtypes[0]);
		resolvedCustomTypes = [
			{ id: customtypes[0], fields: resolvedFields },
		] as typeof resolvedCustomTypes;
	}

	const field: Link = {
		type: "Link",
		config: {
			label: label ?? capitalCase(fieldId),
			select: "document",
			tags,
			customtypes: resolvedCustomTypes,
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${id}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();

	console.info(`Field added: ${id}`);

	const targetId = values["to-slice"] ?? values["to-type"]!;
	console.info(getPostFieldAddMessage({ targetId, modelKind }));
});
