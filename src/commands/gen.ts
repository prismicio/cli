import { createCommandRouter } from "../lib/command";
import genPage from "./gen-page";
import genSetup from "./gen-setup";
import genSliceIndex from "./gen-slice-index";
import genTypes from "./gen-types";

export default createCommandRouter({
	name: "prismic gen",
	description: "Generate files from local Prismic models.",
	commands: {
		page: {
			handler: genPage,
			description: "Generate the page file for a page type",
		},
		setup: {
			handler: genSetup,
			description: "Generate framework-specific Prismic setup",
		},
		"slice-index": {
			handler: genSliceIndex,
			description: "Generate the slice index file of each slice library",
		},
		types: {
			handler: genTypes,
			description: "Generate TypeScript types from local models",
		},
	},
});
