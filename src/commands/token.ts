import { createCommandRouter } from "../lib/command";
import tokenCreate from "./token-create";
import tokenDelete from "./token-delete";
import tokenList from "./token-list";

export default createCommandRouter({
	name: "prismic token",
	description: "Manage API tokens for a Prismic repository.",
	commands: {
		list: {
			handler: tokenList,
			description: "List all tokens",
		},
		create: {
			handler: tokenCreate,
			description: "Create a new token",
		},
		delete: {
			handler: tokenDelete,
			description: "Delete a token",
		},
	},
});
