import type { Link } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getHost, getToken } from "../auth";
import { getCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldSelection, resolveFieldTarget, resolveModel, TARGET_OPTIONS } from "../models";
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
		"FETCHED FIELDS": `
			By default, a content relationship only returns the linked
			document's metadata (ID, type, tags). Use --field to fetch
			specific fields from the related document so you can display
			them without a separate query.

			--field requires exactly one --custom-type so the CLI knows
			which schema to validate against. Dot notation is supported
			for fields inside groups (e.g. --field bio_group.summary).

			Learn more:
			  prismic docs view fields/content-relationship#select-the-fields-to-fetch
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
	const {
		label,
		tag: tags,
		"custom-type": customtypes,
		field: fieldSelection,
		repo = await getRepositoryName(),
	} = values;

	if (fieldSelection && (!customtypes || customtypes.length !== 1)) {
		throw new CommandError("--field requires exactly one --custom-type.");
	}

	const token = await getToken();
	const host = await getHost();
	const [fields, saveModel] = await resolveModel(values, { repo, token, host });
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	let resolvedCustomTypes: NonNullable<Link["config"]>["customtypes"] = customtypes;
	if (fieldSelection && customtypes) {
		const targetType = await getCustomType(customtypes[0], { repo, token, host });
		const resolvedFields = await resolveFieldSelection(fieldSelection, targetType, {
			repo,
			token,
			host,
		});
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
});
