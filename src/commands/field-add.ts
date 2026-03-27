import { createCommandRouter } from "../lib/command";
import fieldAddBoolean from "./field-add-boolean";
import fieldAddLink from "./field-add-link";

export default createCommandRouter({
	name: "prismic field add",
	description: "Add a field to a slice or custom type.",
	commands: {
		boolean: {
			handler: fieldAddBoolean,
			description: "Add a boolean field",
		},
		link: {
			handler: fieldAddLink,
			description: "Add a link field",
		},
	},
});
