import { createCommandRouter } from "../lib/command";
import download from "./starter-download";

export default createCommandRouter({
	name: "prismic starter",
	description: "Download official Prismic starters.",
	commands: {
		download: {
			handler: download,
			description: "Download and configure a starter",
		},
	},
});
