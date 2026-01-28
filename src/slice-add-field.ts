import { parseArgs } from "node:util";

import { sliceAddFieldBoolean } from "./slice-add-field-boolean";
import { sliceAddFieldColor } from "./slice-add-field-color";
import { sliceAddFieldDate } from "./slice-add-field-date";
import { sliceAddFieldEmbed } from "./slice-add-field-embed";
import { sliceAddFieldGeoPoint } from "./slice-add-field-geo-point";
import { sliceAddFieldGroup } from "./slice-add-field-group";
import { sliceAddFieldImage } from "./slice-add-field-image";
import { sliceAddFieldKeyText } from "./slice-add-field-key-text";
import { sliceAddFieldLink } from "./slice-add-field-link";
import { sliceAddFieldNumber } from "./slice-add-field-number";
import { sliceAddFieldRichText } from "./slice-add-field-rich-text";
import { sliceAddFieldSelect } from "./slice-add-field-select";
import { sliceAddFieldTimestamp } from "./slice-add-field-timestamp";

const HELP = `
Add a field to an existing slice.

USAGE
  prismic slice add-field <field-type> <slice-id> <field-id> [flags]

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

FLAGS
  -h, --help             Show help for command

LEARN MORE
  Use \`prismic slice add-field <field-type> --help\` for more information.

EXAMPLES
  prismic slice add-field key-text my_slice title --label "Title"
  prismic slice add-field link my_slice cta --allow-text
  prismic slice add-field rich-text my_slice body --multi "paragraph,heading2,strong,em"
  prismic slice add-field select my_slice layout --option "full" --option "sidebar"
`.trim();

export async function sliceAddField(): Promise<void> {
	const {
		positionals: [fieldType],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "add-field"
		options: {
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: false,
	});

	switch (fieldType) {
		case "boolean":
			await sliceAddFieldBoolean();
			break;
		case "color":
			await sliceAddFieldColor();
			break;
		case "date":
			await sliceAddFieldDate();
			break;
		case "embed":
			await sliceAddFieldEmbed();
			break;
		case "geo-point":
			await sliceAddFieldGeoPoint();
			break;
		case "group":
			await sliceAddFieldGroup();
			break;
		case "image":
			await sliceAddFieldImage();
			break;
		case "key-text":
			await sliceAddFieldKeyText();
			break;
		case "link":
			await sliceAddFieldLink();
			break;
		case "number":
			await sliceAddFieldNumber();
			break;
		case "rich-text":
			await sliceAddFieldRichText();
			break;
		case "select":
			await sliceAddFieldSelect();
			break;
		case "timestamp":
			await sliceAddFieldTimestamp();
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
