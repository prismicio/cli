import { createCommandRouter } from "../lib/command";
import envActive from "./env-active";
import envList from "./env-list";
import envSet from "./env-set";
import envUnset from "./env-unset";

export default createCommandRouter({
	name: "prismic env",
	description: "Manage the active environment for a Prismic project.",
	commands: {
		set: {
			handler: envSet,
			description: "Set the active environment",
		},
		unset: {
			handler: envUnset,
			description: "Reset to the production environment",
		},
		active: {
			handler: envActive,
			description: "Print the active environment",
		},
		list: {
			handler: envList,
			description: "List environments",
		},
	},
});
