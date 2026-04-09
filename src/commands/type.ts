import { createCommandRouter } from "../lib/command";
import typeCreate from "./type-create";
import typeList from "./type-list";
import typeRemove from "./type-remove";
import typeView from "./type-view";

export default createCommandRouter({
	name: "prismic type",
	description: "Manage content types.",
	commands: {
		create: {
			handler: typeCreate,
			description: "Create a new type",
		},
		remove: {
			handler: typeRemove,
			description: "Remove a type",
		},
		list: {
			handler: typeList,
			description: "List types",
		},
		view: {
			handler: typeView,
			description: "View a type",
		},
	},
});
