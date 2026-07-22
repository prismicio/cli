import { createCommandRouter } from "../lib/command";
import instant from "./init-instant";
import project from "./init-project";

export default createCommandRouter({
	name: "prismic init",
	description: "Initialize a Prismic project.",
	defaultHandler: project,
	commands: {
		instant: {
			handler: instant,
			description: "Download and set up a generated project",
		},
	},
});
