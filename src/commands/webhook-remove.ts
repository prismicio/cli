import { getHost, getToken } from "../auth";
import { deleteWebhook, getWebhooks } from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic webhook remove",
	description: `
		Delete a webhook from a Prismic repository.

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
			throw new CommandError(`Failed to remove webhook: ${message}`);
		}
		throw error;
	}

	const webhook = webhooks.find((w) => w.config.url === webhookUrl);
	if (!webhook) {
		throw new CommandError(`Webhook not found: ${webhookUrl}`);
	}

	const id = webhook.config._id;

	try {
		await deleteWebhook(id, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to remove webhook: ${message}`);
		}
		throw error;
	}

	console.info(`Webhook removed: ${webhookUrl}`);
});
