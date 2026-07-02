import { createCommandRouter } from "../lib/command";
import envActive from "./env-active";
import envList from "./env-list";
import envSet from "./env-set";
import envUnset from "./env-unset";

export default createCommandRouter({
	name: "prismic env",
	description: "Manage the active Prismic environment.",
	commands: {
		list: {
			handler: envList,
			description: "List environments",
		},
		set: {
			handler: envSet,
			description: "Set the active environment",
		},
		unset: {
			handler: envUnset,
			description: "Revert to production",
		},
		active: {
			handler: envActive,
			description: "Print the active environment",
		},
	},
});
