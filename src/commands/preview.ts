import { createCommandRouter } from "../lib/command";
import previewAdd from "./preview-add";
import previewList from "./preview-list";
import previewRemove from "./preview-remove";
import previewSetSimulator from "./preview-set-simulator";

export default createCommandRouter({
	name: "prismic preview",
	description: "Manage previews in a Prismic repository.",
	sections: {
		EXAMPLES: `
			Set up previews after a deploy, using both settings:
			  prismic preview add https://example.com/api/preview
			  prismic preview set-simulator https://example.com
		`,
	},
	commands: {
		add: {
			handler: previewAdd,
			description: "Add a preview URL",
		},
		list: {
			handler: previewList,
			description: "List preview URLs and the simulator URL",
		},
		remove: {
			handler: previewRemove,
			description: "Remove a preview URL",
		},
		"set-simulator": {
			handler: previewSetSimulator,
			description: "Set the slice simulator URL",
		},
	},
});
