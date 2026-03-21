import { getHost, getToken } from "../auth";
import { getWebhooks, WEBHOOK_TRIGGERS } from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic webhook view",
	description: `
		View details of a webhook in a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		url: { description: "Webhook URL" },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [webhookUrl] = positionals;
	const { repo = await getRepositoryName() } = values;

	if (!webhookUrl) {
		throw new CommandError("Missing required argument: <url>");
	}

	const token = await getToken();
	const host = await getHost();
	const webhooks = await getWebhooks({ repo, token, host });

	const webhook = webhooks.find((webhook) => webhook.config.url === webhookUrl);
	if (!webhook) {
		throw new CommandError(`Webhook not found: ${webhookUrl}`);
	}

	const { config: whConfig } = webhook;

	console.info(`URL:     ${whConfig.url}`);
	console.info(`Name:    ${whConfig.name || "(none)"}`);
	console.info(`Status:  ${whConfig.active ? "enabled" : "disabled"}`);
	console.info(`Secret:  ${whConfig.secret ? "(set)" : "(none)"}`);

	// Show triggers
	const enabledTriggers: string[] = [];
	for (const trigger of WEBHOOK_TRIGGERS) {
		if (whConfig[trigger as keyof typeof whConfig]) {
			enabledTriggers.push(trigger);
		}
	}
	console.info(`Triggers: ${enabledTriggers.length > 0 ? enabledTriggers.join(", ") : "(none)"}`);

	// Show headers
	const headerKeys = Object.keys(whConfig.headers);
	if (headerKeys.length > 0) {
		console.info("Headers:");
		for (const [key, value] of Object.entries(whConfig.headers)) {
			console.info(`  ${key}: ${value}`);
		}
	} else {
		console.info("Headers: (none)");
	}
});
