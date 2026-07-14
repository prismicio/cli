import type { RichText } from "@prismicio/types-internal/lib/customtypes";

import { capitalCase } from "change-case";

import { getNewFieldTarget, TARGET_OPTIONS } from "../fields";
import { createCommand, type CommandConfig } from "../lib/command";
import { addField } from "../lib/prismic/models";

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
		EXAMPLES: `
			Add a title field (single heading):
			  prismic field add rich-text title --to-type blog_post --allow heading1 --single

			Add a body field with only headings and paragraphs:
			  prismic field add rich-text body --to-type blog_post --allow heading1,heading2,paragraph,strong,em,hyperlink
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
	} = values;

	const { fields, fieldId, save } = await getNewFieldTarget(id, values);

	const field: RichText = {
		type: "StructuredText",
		config: {
			label: label ?? capitalCase(fieldId),
			placeholder,
			...(isSingle ? { single: allow } : { multi: allow }),
			allowTargetBlank,
		},
	};

	addField(fields, fieldId, field);
	await save();

	console.info(`Field added: ${id}`);
});
