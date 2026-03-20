import { createCommandRouter } from "../lib/command";

import webhookCreate from "./webhook-create";
import webhookDisable from "./webhook-disable";
import webhookEnable from "./webhook-enable";
import webhookList from "./webhook-list";
import webhookRemove from "./webhook-remove";
import webhookSetTriggers from "./webhook-set-triggers";
import webhookView from "./webhook-view";

export const webhook = createCommandRouter({
	name: "webhook",
	description: "Manage webhooks in a Prismic repository.",
	commands: {
		list: { handler: webhookList, description: "List all webhooks" },
		create: { handler: webhookCreate, description: "Create a new webhook" },
		view: { handler: webhookView, description: "View webhook details" },
		remove: { handler: webhookRemove, description: "Delete a webhook" },
		enable: { handler: webhookEnable, description: "Enable a webhook" },
		disable: { handler: webhookDisable, description: "Disable a webhook" },
		"set-triggers": { handler: webhookSetTriggers, description: "Update webhook triggers" },
	},
});
