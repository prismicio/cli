import { createCommandRouter } from "../lib/command";
import previewAdd from "./preview-add";
import previewList from "./preview-list";
import previewRemove from "./preview-remove";
import previewSetSimulator from "./preview-set-simulator";

export default createCommandRouter({
	name: "prismic preview",
	description: `
		Manage previews in a Prismic repository.

		A repository has two preview settings. They usually point at the same
		website, so when you change one, change the other:

		- Preview URLs let writers browse the website with draft content. Manage them
		  with add, list, and remove.
		- The simulator URL lets the Page Builder load live slice previews. Set it
		  with set-simulator.

		A website needs both a preview URL and a simulator URL. When the website gets
		a new address, for example after a deploy, add its preview URL and set its
		simulator URL.
	`,
	sections: {
		EXAMPLES: `
			# Set up previews for a deployed website
			prismic preview add https://example.com/api/preview --name Production
			prismic preview set-simulator https://example.com
		`,
	},
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
			description: "Set the slice simulator URL for live previews",
		},
	},
});
