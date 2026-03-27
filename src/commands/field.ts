import { createCommandRouter } from "../lib/command";
import fieldAdd from "./field-add";
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
