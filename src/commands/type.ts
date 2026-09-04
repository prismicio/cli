import { createCommandRouter } from "../lib/command";
import typeAddTab from "./type-add-tab";
import typeCreate from "./type-create";
import typeEdit from "./type-edit";
import typeEditTab from "./type-edit-tab";
import typeList from "./type-list";
import typeRemove from "./type-remove";
import typeRemoveTab from "./type-remove-tab";
import typeView from "./type-view";

export default createCommandRouter({
	name: "prismic type",
	description: "Manage content types.",
	sections: {
		ROUTES: `
			Page types get a URL from a route in prismic.config.json, for example:
			  { "type": "blog_post", "path": "/blog/:uid" }
			prismic.config.json is project configuration, not a model file, so edit
			it directly. There is no route command.
			Run \`prismic docs view routes\` for path keywords and route properties.
		`,
	},
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
		"add-tab": {
			handler: typeAddTab,
			description: "Add a tab to a content type",
		},
		"edit-tab": {
			handler: typeEditTab,
			description: "Edit a tab of a content type",
		},
		"remove-tab": {
			handler: typeRemoveTab,
			description: "Remove a tab from a content type",
		},
	},
});
