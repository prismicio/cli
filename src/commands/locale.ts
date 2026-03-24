import { createCommandRouter } from "../lib/command";
import localeAdd from "./locale-add";
import localeList from "./locale-list";
import localeRemove from "./locale-remove";
import localeSetMaster from "./locale-set-master";

export default createCommandRouter({
	name: "prismic locale",
	description: "Manage locales in a Prismic repository.",
	commands: {
		add: {
			handler: localeAdd,
			description: "Add a locale",
		},
		list: {
			handler: localeList,
			description: "List locales",
		},
		remove: {
			handler: localeRemove,
			description: "Remove a locale",
		},
		"set-master": {
			handler: localeSetMaster,
			description: "Set the master locale",
		},
	},
});
