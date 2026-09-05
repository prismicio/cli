import { createCommandRouter } from "../lib/command";
import docs from "./docs";
import env from "./env";
import field from "./field";
import gen from "./gen";
import init from "./init";
import locale from "./locale";
import login from "./login";
import logout from "./logout";
import preview from "./preview";
import pull from "./pull";
import push from "./push";
import repo from "./repo";
import slice from "./slice";
import status from "./status";
import sync from "./sync";
import token from "./token";
import type_ from "./type";
import webhook from "./webhook";
import whoami from "./whoami";

export default createCommandRouter({
	name: "prismic",
	description: "Prismic CLI for managing repositories and configurations.",
	sections: {
		DOCUMENTATION: `
			Run \`prismic docs list\` to browse available documentation topics.
			Run \`prismic docs view <path>\` to read a topic.
		`,
		ROUTES: `
			Page URLs are routes in prismic.config.json, for example:
			  { "type": "blog_post", "path": "/blog/:uid" }
			prismic.config.json is project configuration, not a model file, so edit
			it directly. There is no route command.
			Run \`prismic docs view routes\` for path keywords and route properties.
		`,
		PREVIEWS: `
			A website needs two settings, a preview URL and a slice simulator URL.
			Run \`prismic docs view previews\` to learn how to set both.
		`,
	},
	commands: {
		init: {
			handler: init,
			description: "Initialize a Prismic project",
		},
		docs: {
			handler: docs,
			description: "Browse Prismic documentation",
		},
		gen: {
			handler: gen,
			description: "Generate files from local models",
		},
		pull: {
			handler: pull,
			description: "Pull types and slices from Prismic",
		},
		push: {
			handler: push,
			description: "Push types and slices to Prismic",
		},
		sync: {
			handler: sync,
			description: "Sync types and slices from Prismic",
		},
		status: {
			handler: status,
			description: "Show local vs remote model differences",
		},
		env: {
			handler: env,
			description: "Manage the active environment",
			hidden: true,
		},
		locale: {
			handler: locale,
			description: "Manage locales",
		},
		repo: {
			handler: repo,
			description: "Manage repositories",
		},
		type: {
			handler: type_,
			description: "Manage content types",
		},
		field: {
			handler: field,
			description: "Manage fields",
		},
		slice: {
			handler: slice,
			description: "Manage slices",
		},
		preview: {
			handler: preview,
			description: "Manage preview and simulator URLs",
		},
		token: {
			handler: token,
			description: "Manage API tokens",
		},
		webhook: {
			handler: webhook,
			description: "Manage webhooks",
		},
		login: {
			handler: login,
			description: "Log in to Prismic",
		},
		logout: {
			handler: logout,
			description: "Log out of Prismic",
		},
		whoami: {
			handler: whoami,
			description: "Show the currently logged in user",
		},
	},
});
