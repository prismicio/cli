import { createCommandRouter } from "../lib/command";
import genTypes from "./gen-types";

export default createCommandRouter({
	name: "prismic gen",
	description: "Generate files from local Prismic models.",
	commands: {
		types: {
			handler: genTypes,
			description: "Generate TypeScript types from local models",
		},
	},
});
