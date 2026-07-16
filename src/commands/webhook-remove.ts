import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { deleteWebhook, getWebhooks } from "../lib/prismic/clients/wroom";

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

	const id = webhook.config._id;

	await deleteWebhook(id, { repo, token, host });

	console.info(`Webhook removed: ${webhookUrl}`);
});
