import { createCommandRouter } from "../lib/command";
import previewAdd from "./preview-add";
import previewList from "./preview-list";
import previewRemove from "./preview-remove";
import previewSetSimulator from "./preview-set-simulator";

export default createCommandRouter({
	name: "prismic preview",
	description: "Manage preview configurations in a Prismic repository.",
	commands: {
		add: {
			handler: previewAdd,
			description: "Add a preview configuration",
		},
		list: {
			handler: previewList,
			description: "List preview configurations",
		},
		remove: {
			handler: previewRemove,
			description: "Remove a preview configuration",
		},
		"set-simulator": {
			handler: previewSetSimulator,
			description: "Set the slice simulator URL",
		},
	},
});
