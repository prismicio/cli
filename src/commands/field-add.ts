import { createCommandRouter } from "../lib/command";
import fieldAddBoolean from "./field-add-boolean";
import fieldAddColor from "./field-add-color";
import fieldAddContentRelationship from "./field-add-content-relationship";
import fieldAddDate from "./field-add-date";
import fieldAddEmbed from "./field-add-embed";
import fieldAddGeopoint from "./field-add-geopoint";
import fieldAddGroup from "./field-add-group";
import fieldAddImage from "./field-add-image";
import fieldAddIntegration from "./field-add-integration";
import fieldAddLink from "./field-add-link";
import fieldAddNumber from "./field-add-number";
import fieldAddRichText from "./field-add-rich-text";
import fieldAddSelect from "./field-add-select";
import fieldAddTable from "./field-add-table";
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
		"content-relationship": {
			handler: fieldAddContentRelationship,
			description: "Add a content relationship field for fetching data from related documents (not for navigation -- use link)",
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
		group: {
			handler: fieldAddGroup,
			description: "Add a group field",
		},
		image: {
			handler: fieldAddImage,
			description: "Add an image field",
		},
		integration: {
			handler: fieldAddIntegration,
			description: "Add an integration field",
		},
		link: {
			handler: fieldAddLink,
			description: "Add a link field for URLs, documents, or media (navigational)",
		},
		number: {
			handler: fieldAddNumber,
			description: "Add a number field",
		},
		"rich-text": {
			handler: fieldAddRichText,
			description: "Add a rich text field",
		},
		select: {
			handler: fieldAddSelect,
			description: "Add a select field",
		},
		table: {
			handler: fieldAddTable,
			description: "Add a table field",
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
