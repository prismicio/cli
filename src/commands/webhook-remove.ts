import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { deleteWebhook, getWebhooks } from "../lib/prismic/client";

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

	const { host, getToken } = await getCredentials();
	const webhooks = await getWebhooks({ repo, host, getToken });

	const webhook = webhooks.find((w) => w.config.url === webhookUrl);
	if (!webhook) {
		throw new CommandError(`Webhook not found: ${webhookUrl}`);
	}

	const id = webhook.config._id;

	await deleteWebhook(id, { repo, host, getToken });

	console.info(`Webhook removed: ${webhookUrl}`);
});
