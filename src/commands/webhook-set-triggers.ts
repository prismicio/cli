import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import {
	getWebhooks,
	updateWebhook,
	WEBHOOK_TRIGGERS,
	type WebhookTriggers,
} from "../lib/prismic/clients/wroom";

const config = {
	name: "prismic webhook set-triggers",
	description: `
		Update which events trigger a webhook.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		url: { description: "Webhook URL", required: true },
	},
	options: {
		trigger: {
			type: "string",
			multiple: true,
			short: "t",
			description: "Trigger events (can be repeated)",
			required: true,
		},
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: {
			type: "string",
			short: "e",
			description: "Alias for --repo",
			deprecated: "Use `prismic env` or --repo instead.",
		},
	},
	sections: {
		TRIGGERS: `
			documentsPublished    When documents are published
			documentsUnpublished  When documents are unpublished
			releasesCreated       When a release is created
			releasesUpdated       When a release is edited or deleted
			tagsCreated           When a tag is created
			tagsDeleted           When a tag is deleted
		`,
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [webhookUrl] = positionals;
	const { env, repo = env ?? (await getActiveRepositoryName()), trigger = [] } = values;

	for (const t of trigger) {
		if (!WEBHOOK_TRIGGERS.includes(t as keyof WebhookTriggers)) {
			throw new CommandError(
				`Invalid trigger: ${t}\nValid triggers: ${WEBHOOK_TRIGGERS.join(", ")}`,
			);
		}
	}

	const { token, host } = await getCredentials();
	const webhooks = await getWebhooks({ repo, token, host });

	const webhook = webhooks.find((w) => w.config.url === webhookUrl);
	if (!webhook) {
		throw new CommandError(`Webhook not found: ${webhookUrl}`);
	}

	const triggers = Object.fromEntries(
		WEBHOOK_TRIGGERS.map((name) => [name, trigger.includes(name)]),
	) as WebhookTriggers;

	await updateWebhook(
		webhook.config._id,
		{ ...webhook.config, ...triggers },
		{ repo, token, host },
	);

	console.info(`Webhook triggers updated: ${trigger.join(", ")}`);
});
