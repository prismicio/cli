import { createCommandRouter } from "../lib/command";
import fieldAddBoolean from "./field-add-boolean";
import fieldAddColor from "./field-add-color";
import fieldAddDate from "./field-add-date";
import fieldAddEmbed from "./field-add-embed";
import fieldAddGeopoint from "./field-add-geopoint";
import fieldAddIntegration from "./field-add-integration";
import fieldAddLink from "./field-add-link";
import fieldAddNumber from "./field-add-number";
import fieldAddText from "./field-add-text";
import fieldAddTimestamp from "./field-add-timestamp";
import fieldAddUid from "./field-add-uid";

export default createCommandRouter({
	name: "prismic field add",
	description: "Add a field to a slice or custom type.",
	commands: {
		boolean: {
			handler: fieldAddBoolean,
			description: "Add a boolean field",
		},
		color: {
			handler: fieldAddColor,
			description: "Add a color field",
		},
		date: {
			handler: fieldAddDate,
			description: "Add a date field",
		},
		embed: {
			handler: fieldAddEmbed,
			description: "Add an embed field",
		},
		geopoint: {
			handler: fieldAddGeopoint,
			description: "Add a geopoint field",
		},
		integration: {
			handler: fieldAddIntegration,
			description: "Add an integration field",
		},
		link: {
			handler: fieldAddLink,
			description: "Add a link field",
		},
		number: {
			handler: fieldAddNumber,
			description: "Add a number field",
		},
		text: {
			handler: fieldAddText,
			description: "Add a text field",
		},
		timestamp: {
			handler: fieldAddTimestamp,
			description: "Add a timestamp field",
		},
		uid: {
			handler: fieldAddUid,
			description: "Add a UID field",
		},
	},
});
