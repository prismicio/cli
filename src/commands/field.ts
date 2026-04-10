import { createCommandRouter } from "../lib/command";
import fieldAdd from "./field-add";
import fieldEdit from "./field-edit";
import fieldRemove from "./field-remove";

export default createCommandRouter({
	name: "prismic field",
	description: "Manage fields in slices and content types.",
	commands: {
		add: {
			handler: fieldAdd,
			description: "Add a field",
		},
		edit: {
			handler: fieldEdit,
			description: "Edit a field",
		},
		remove: {
			handler: fieldRemove,
			description: "Remove a field",
		},
	},
});
