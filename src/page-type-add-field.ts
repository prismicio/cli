import { parseArgs } from "node:util";

import { pageTypeAddFieldBoolean } from "./page-type-add-field-boolean";
import { pageTypeAddFieldColor } from "./page-type-add-field-color";
import { pageTypeAddFieldDate } from "./page-type-add-field-date";
import { pageTypeAddFieldEmbed } from "./page-type-add-field-embed";
import { pageTypeAddFieldGeoPoint } from "./page-type-add-field-geo-point";
import { pageTypeAddFieldImage } from "./page-type-add-field-image";
import { pageTypeAddFieldKeyText } from "./page-type-add-field-key-text";
import { pageTypeAddFieldLink } from "./page-type-add-field-link";
import { pageTypeAddFieldNumber } from "./page-type-add-field-number";
import { pageTypeAddFieldRichText } from "./page-type-add-field-rich-text";
import { pageTypeAddFieldSelect } from "./page-type-add-field-select";
import { pageTypeAddFieldTimestamp } from "./page-type-add-field-timestamp";
import { pageTypeAddFieldUid } from "./page-type-add-field-uid";

const HELP = `
Add a field to an existing page type.

USAGE
  prismic page-type add-field <field-type> <type-id> <field-id> [flags]

FIELD TYPES
  boolean                Boolean toggle
  color                  Color picker
  date                   Date picker
  embed                  Embed (oEmbed)
  geo-point              Geographic coordinates
  image                  Image
  key-text               Single-line text
  link                   Any link type
  number                 Number
  rich-text              Rich text editor
  select                 Dropdown select
  timestamp              Date and time
  uid                    Unique identifier

FLAGS
  -h, --help             Show help for command

LEARN MORE
  Use \`prismic page-type add-field <field-type> --help\` for more information.

EXAMPLES
  prismic page-type add-field key-text homepage meta_title --tab "SEO"
  prismic page-type add-field link homepage button --allow-text
  prismic page-type add-field rich-text homepage body --multi "paragraph,heading2,strong,em"
  prismic page-type add-field select homepage layout --option "full" --option "sidebar"
`.trim();

export async function pageTypeAddField(): Promise<void> {
	const {
		positionals: [fieldType],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "page-type", "add-field"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (fieldType) {
		case "boolean":
			await pageTypeAddFieldBoolean();
			break;
		case "color":
			await pageTypeAddFieldColor();
			break;
		case "date":
			await pageTypeAddFieldDate();
			break;
		case "embed":
			await pageTypeAddFieldEmbed();
			break;
		case "geo-point":
			await pageTypeAddFieldGeoPoint();
			break;
		case "image":
			await pageTypeAddFieldImage();
			break;
		case "key-text":
			await pageTypeAddFieldKeyText();
			break;
		case "link":
			await pageTypeAddFieldLink();
			break;
		case "number":
			await pageTypeAddFieldNumber();
			break;
		case "rich-text":
			await pageTypeAddFieldRichText();
			break;
		case "select":
			await pageTypeAddFieldSelect();
			break;
		case "timestamp":
			await pageTypeAddFieldTimestamp();
			break;
		case "uid":
			await pageTypeAddFieldUid();
			break;
		default: {
			if (fieldType) {
				console.error(`Unknown field type: ${fieldType}\n`);
				process.exitCode = 1;
			}
			console.info(HELP);
		}
	}
}
