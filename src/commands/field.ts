import { createCommandRouter } from "../lib/command";
import fieldAdd from "./field-add";
import fieldEdit from "./field-edit";
import fieldList from "./field-list";
import fieldRemove from "./field-remove";

export default createCommandRouter({
	name: "prismic field",
	description: "Manage fields in slices and custom types.",
	commands: {
		add: {
			handler: fieldAdd,
			description: "Add a field",
		},
		edit: {
			handler: fieldEdit,
			description: "Edit a field",
		},
		list: {
			handler: fieldList,
			description: "List fields",
		},
		remove: {
			handler: fieldRemove,
			description: "Remove a field",
		},
	},
});
