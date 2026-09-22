import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getWebhooks, WEBHOOK_TRIGGERS } from "../lib/prismic/clients/wroom";

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
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: {
			type: "string",
			short: "e",
			description: "Alias for --repo",
			deprecated: "Use `prismic env` or --repo instead.",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [webhookUrl] = positionals;
	const { env, repo = env ?? (await getActiveRepositoryName()) } = values;

	const { token, host } = await getCredentials();
	const webhooks = await getWebhooks({ repo, token, host });

	const webhookConfig = webhooks.find((webhook) => webhook.config.url === webhookUrl)?.config;
	if (!webhookConfig) {
		throw new CommandError(`Webhook not found: ${webhookUrl}`);
	}

	console.info(`URL:     ${webhookConfig.url}`);
	console.info(`Name:    ${webhookConfig.name || "(none)"}`);
	console.info(`Status:  ${webhookConfig.active ? "enabled" : "disabled"}`);
	console.info(`Secret:  ${webhookConfig.secret ? "(set)" : "(none)"}`);

	const enabledTriggers = WEBHOOK_TRIGGERS.filter((trigger) => webhookConfig[trigger]);
	console.info(`Triggers: ${enabledTriggers.length > 0 ? enabledTriggers.join(", ") : "(none)"}`);

	const headers = Object.entries(webhookConfig.headers);
	if (headers.length === 0) {
		console.info("Headers: (none)");
		return;
	}
	console.info("Headers:");
	for (const [key, value] of headers) console.info(`  ${key}: ${value}`);
});
