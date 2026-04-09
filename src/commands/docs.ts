import { createCommandRouter } from "../lib/command";

import docsList from "./docs-list";
import docsView from "./docs-view";

export default createCommandRouter({
	name: "prismic docs",
	description: "Browse Prismic documentation.",
	commands: {
		list: {
			handler: docsList,
			description: "List available documentation pages",
		},
		view: {
			handler: docsView,
			description: "View a documentation page",
		},
	},
});
