import { createCommandRouter } from "../lib/command";
import genSetup from "./gen-setup";
import genSliceIndex from "./gen-slice-index";
import genTypes from "./gen-types";

export default createCommandRouter({
	name: "prismic gen",
	description: "Generate files from local Prismic models.",
	commands: {
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
