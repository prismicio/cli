import { getHost, getToken } from "../auth";
import { getWebhooks, WEBHOOK_TRIGGERS } from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic webhook view",
	description: `
		View details of a webhook in a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		url: { description: "Webhook URL", required: true },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [webhookUrl] = positionals;
	const { repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	let webhooks;
	try {
		webhooks = await getWebhooks({ repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to fetch webhook details: ${message}`);
		}
		throw error;
	}

	const webhook = webhooks.find((webhook) => webhook.config.url === webhookUrl);
	if (!webhook) {
		throw new CommandError(`Webhook not found: ${webhookUrl}`);
	}

	const { config: webhookConfig } = webhook;

	console.info(`URL:     ${webhookConfig.url}`);
	console.info(`Name:    ${webhookConfig.name || "(none)"}`);
	console.info(`Status:  ${webhookConfig.active ? "enabled" : "disabled"}`);
	console.info(`Secret:  ${webhookConfig.secret ? "(set)" : "(none)"}`);

	// Show triggers
	const enabledTriggers: string[] = [];
	for (const trigger of WEBHOOK_TRIGGERS) {
		if (webhookConfig[trigger as keyof typeof webhookConfig]) {
			enabledTriggers.push(trigger);
		}
	}
	console.info(`Triggers: ${enabledTriggers.length > 0 ? enabledTriggers.join(", ") : "(none)"}`);

	// Show headers
	const headerKeys = Object.keys(webhookConfig.headers);
	if (headerKeys.length > 0) {
		console.info("Headers:");
		for (const [key, value] of Object.entries(webhookConfig.headers)) {
			console.info(`  ${key}: ${value}`);
		}
	} else {
		console.info("Headers: (none)");
	}
});
