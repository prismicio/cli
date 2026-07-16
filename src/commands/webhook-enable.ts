import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getWebhooks, updateWebhook } from "../lib/prismic/clients/wroom";

const config = {
	name: "prismic webhook enable",
	description: `
		Enable a webhook in a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		url: { description: "Webhook URL", required: true },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: { type: "string", short: "e", description: "(deprecated) Alias for --repo" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [webhookUrl] = positionals;
	const {
		env,
		repo = env ?? (await getActiveRepositoryName()),
	} = values;

	const { token, host } = await getCredentials();
	const webhooks = await getWebhooks({ repo, token, host });

	const webhook = webhooks.find((w) => w.config.url === webhookUrl);
	if (!webhook) {
		throw new CommandError(`Webhook not found: ${webhookUrl}`);
	}

	if (webhook.config.active) {
		console.info(`Webhook already enabled: ${webhookUrl}`);
		return;
	}

	const id = webhook.config._id;

	const updatedConfig = structuredClone(webhook.config);
	updatedConfig.active = true;

	await updateWebhook(id, updatedConfig, { repo, token, host });

	console.info(`Webhook enabled: ${webhookUrl}`);
});
