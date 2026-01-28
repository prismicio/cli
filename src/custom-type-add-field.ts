import { parseArgs } from "node:util";

import { customTypeAddFieldBoolean } from "./custom-type-add-field-boolean";
import { customTypeAddFieldColor } from "./custom-type-add-field-color";
import { customTypeAddFieldDate } from "./custom-type-add-field-date";
import { customTypeAddFieldEmbed } from "./custom-type-add-field-embed";
import { customTypeAddFieldGeoPoint } from "./custom-type-add-field-geo-point";
import { customTypeAddFieldGroup } from "./custom-type-add-field-group";
import { customTypeAddFieldImage } from "./custom-type-add-field-image";
import { customTypeAddFieldKeyText } from "./custom-type-add-field-key-text";
import { customTypeAddFieldLink } from "./custom-type-add-field-link";
import { customTypeAddFieldNumber } from "./custom-type-add-field-number";
import { customTypeAddFieldRichText } from "./custom-type-add-field-rich-text";
import { customTypeAddFieldSelect } from "./custom-type-add-field-select";
import { customTypeAddFieldTimestamp } from "./custom-type-add-field-timestamp";
import { customTypeAddFieldUid } from "./custom-type-add-field-uid";

const HELP = `
Add a field to an existing custom type.

USAGE
  prismic custom-type add-field <field-type> <type-id> <field-id> [flags]

FIELD TYPES
  boolean                Boolean toggle
  color                  Color picker
  date                   Date picker
  embed                  Embed (oEmbed)
  geo-point              Geographic coordinates
  group                  Repeatable group of fields
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
  Use \`prismic custom-type add-field <field-type> --help\` for more information.

EXAMPLES
  prismic custom-type add-field key-text homepage meta_title --tab "SEO"
  prismic custom-type add-field link homepage button --allow-text
  prismic custom-type add-field rich-text homepage body --multi "paragraph,heading2,strong,em"
  prismic custom-type add-field select homepage layout --option "full" --option "sidebar"
`.trim();

export async function customTypeAddField(): Promise<void> {
	const {
		positionals: [fieldType],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "custom-type", "add-field"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (fieldType) {
		case "boolean":
			await customTypeAddFieldBoolean();
			break;
		case "color":
			await customTypeAddFieldColor();
			break;
		case "date":
			await customTypeAddFieldDate();
			break;
		case "embed":
			await customTypeAddFieldEmbed();
			break;
		case "geo-point":
			await customTypeAddFieldGeoPoint();
			break;
		case "group":
			await customTypeAddFieldGroup();
			break;
		case "image":
			await customTypeAddFieldImage();
			break;
		case "key-text":
			await customTypeAddFieldKeyText();
			break;
		case "link":
			await customTypeAddFieldLink();
			break;
		case "number":
			await customTypeAddFieldNumber();
			break;
		case "rich-text":
			await customTypeAddFieldRichText();
			break;
		case "select":
			await customTypeAddFieldSelect();
			break;
		case "timestamp":
			await customTypeAddFieldTimestamp();
			break;
		case "uid":
			await customTypeAddFieldUid();
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
