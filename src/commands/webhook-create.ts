import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import {
	createWebhook,
	WEBHOOK_TRIGGERS,
	type WebhookTriggers,
} from "../lib/prismic/clients/wroom";

const config = {
	name: "prismic webhook create",
	description: `
		Create a new webhook in a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		url: { description: "Webhook URL to receive events", required: true },
	},
	options: {
		name: { type: "string", short: "n", description: "Webhook name" },
		secret: { type: "string", short: "s", description: "Secret for webhook signature" },
		trigger: {
			type: "string",
			multiple: true,
			short: "t",
			description: "Trigger events (can be repeated)",
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

			If no triggers specified, all are enabled.
		`,
		EXAMPLES: `
			Create a webhook for all events:
			  prismic webhook create https://example.com/webhook

			Create a webhook for specific events:
			  prismic webhook create https://example.com/webhook -t documentsPublished -t documentsUnpublished

			Create a named webhook with a secret:
			  prismic webhook create https://example.com/webhook --name "Deploy" --secret my-secret
		`,
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [webhookUrl] = positionals;
	const {
		env,
		repo = env ?? (await getActiveRepositoryName()),
		name,
		secret,
		trigger = [],
	} = values;

	for (const t of trigger) {
		if (!WEBHOOK_TRIGGERS.includes(t as keyof WebhookTriggers)) {
			throw new CommandError(
				`Invalid trigger: ${t}\nValid triggers: ${WEBHOOK_TRIGGERS.join(", ")}`,
			);
		}
	}

	const { token, host } = await getCredentials();

	// No triggers means all triggers.
	const triggers = Object.fromEntries(
		WEBHOOK_TRIGGERS.map((key) => [key, trigger.length === 0 || trigger.includes(key)]),
	) as WebhookTriggers;

	await createWebhook(
		{ url: webhookUrl, name: name ?? null, secret: secret ?? null, ...triggers },
		{ repo, token, host },
	);

	console.info(`Webhook created: ${webhookUrl}`);
	console.info(`Run \`prismic webhook set-triggers ${webhookUrl}\` to configure triggers.`);
});
