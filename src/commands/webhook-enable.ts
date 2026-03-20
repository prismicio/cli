import { getHost, getToken } from "../auth";
import { getWebhooks, updateWebhook } from "../clients/wroom";
import { CommandError, createCommand, defineCommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = defineCommandConfig({
	name: "webhook enable",
	description: `Enable a webhook in a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.`,
	positionals: {
		url: { description: "Webhook URL" },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
});

export default createCommand(config, async ({ positionals, values }) => {
	const [webhookUrl] = positionals;
	const { repo = await getRepositoryName() } = values;

	if (!webhookUrl) {
		throw new CommandError("Missing required argument: <url>");
	}

	const token = await getToken();
	const host = await getHost();
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

	try {
		await updateWebhook(id, updatedConfig, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to enable webhook: ${message}`);
		}
		throw error;
	}

	console.info(`Webhook enabled: ${webhookUrl}`);
});
