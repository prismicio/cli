import { createCommandRouter } from "../lib/command";
import typeCreate from "./type-create";
import typeEdit from "./type-edit";
import typeList from "./type-list";
import typeRemove from "./type-remove";
import typeView from "./type-view";

export default createCommandRouter({
	name: "prismic type",
	description: "Manage content types.",
	commands: {
		create: {
			handler: typeCreate,
			description: "Create a new content type",
		},
		edit: {
			handler: typeEdit,
			description: "Edit a content type",
		},
		remove: {
			handler: typeRemove,
			description: "Remove a content type",
		},
		list: {
			handler: typeList,
			description: "List content types",
		},
		view: {
			handler: typeView,
			description: "View a content type",
		},
	},
});
