import type { RichText } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldTarget, resolveModel, TARGET_OPTIONS } from "../models";
import { getRepositoryName } from "../project";

const ALL_BLOCKS =
	"paragraph,preformatted,heading1,heading2,heading3,heading4,heading5,heading6,strong,em,hyperlink,image,embed,list-item,o-list-item,rtl";

const config = {
	name: "prismic field add rich-text",
	description: "Add a rich text field to a slice or custom type.",
	sections: {
		BLOCKS: `
			heading1, heading2, heading3, heading4, heading5, heading6,
			paragraph, strong, em, preformatted, hyperlink, image, embed,
			list-item, o-list-item, rtl
		`,
	},
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
		allow: {
			type: "string",
			description: "Comma-separated allowed block types (e.g. heading1,heading2,paragraph)",
		},
		single: { type: "boolean", description: "Restrict to a single block" },
		"allow-target-blank": { type: "boolean", description: "Allow opening links in new tab" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const {
		label,
		placeholder,
		allow = ALL_BLOCKS,
		single: isSingle,
		"allow-target-blank": allowTargetBlank,
		repo = await getRepositoryName(),
	} = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const [fields, saveModel] = await resolveModel(values, { repo, token, host });
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field: RichText = {
		type: "StructuredText",
		config: {
			label: label ?? capitalCase(fieldId),
			placeholder,
			...(isSingle ? { single: allow } : { multi: allow }),
			allowTargetBlank,
		},
	};

	if (fieldId in targetFields) throw new CommandError(`Field "${id}" already exists.`);
	targetFields[fieldId] = field;
	await saveModel();

	await adapter.syncModels({ repo, token, host });

	console.info(`Field added: ${id}`);
});
