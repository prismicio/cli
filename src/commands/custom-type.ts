import { createCommandRouter } from "../lib/command";
import customTypeCreate from "./custom-type-create";
import customTypeList from "./custom-type-list";
import customTypeRemove from "./custom-type-remove";
import customTypeView from "./custom-type-view";

export default createCommandRouter({
	name: "prismic custom-type",
	description: "Manage custom types.",
	commands: {
		create: {
			handler: customTypeCreate,
			description: "Create a new custom type",
		},
		remove: {
			handler: customTypeRemove,
			description: "Remove a custom type",
		},
		list: {
			handler: customTypeList,
			description: "List custom types",
		},
		view: {
			handler: customTypeView,
			description: "View a custom type",
		},
	},
});
