import { createCommandRouter } from "../lib/command";
import repoCreate from "./repo-create";
import repoList from "./repo-list";
import repoSetApiAccess from "./repo-set-api-access";
import repoSetName from "./repo-set-name";
import repoView from "./repo-view";

export default createCommandRouter({
	name: "prismic repo",
	description: "Manage Prismic repositories.",
	commands: {
		create: {
			handler: repoCreate,
			description: "Create a new repository",
		},
		list: {
			handler: repoList,
			description: "List repositories",
		},
		view: {
			handler: repoView,
			description: "View repository details",
		},
		"set-name": {
			handler: repoSetName,
			description: "Set repository display name",
		},
		"set-api-access": {
			handler: repoSetApiAccess,
			description: "Set Content API access level",
		},
	},
});
