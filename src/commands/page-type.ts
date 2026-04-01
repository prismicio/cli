import { createCommandRouter } from "../lib/command";
import pageTypeCreate from "./page-type-create";
import pageTypeList from "./page-type-list";
import pageTypeRemove from "./page-type-remove";
import pageTypeView from "./page-type-view";

export default createCommandRouter({
	name: "prismic page-type",
	description: "Manage page types.",
	commands: {
		create: {
			handler: pageTypeCreate,
			description: "Create a new page type",
		},
		remove: {
			handler: pageTypeRemove,
			description: "Remove a page type",
		},
		list: {
			handler: pageTypeList,
			description: "List page types",
		},
		view: {
			handler: pageTypeView,
			description: "View a page type",
		},
	},
});
