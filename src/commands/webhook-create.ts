import { getHost, getToken } from "../auth";
import { createWebhook, WEBHOOK_TRIGGERS } from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { NotFoundRequestError, UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

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
		repo: { type: "string", short: "r", description: "Repository domain" },
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
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [webhookUrl] = positionals;
	const { repo = await getRepositoryName(), name, secret, trigger = [] } = values;

	// Validate triggers
	for (const t of trigger) {
		if (!WEBHOOK_TRIGGERS.includes(t)) {
			throw new CommandError(
				`Invalid trigger: ${t}\nValid triggers: ${WEBHOOK_TRIGGERS.join(", ")}`,
			);
		}
	}

	const token = await getToken();
	const host = await getHost();

	const defaultValue = trigger.length > 0 ? false : true;

	try {
		await createWebhook(
			{
				url: webhookUrl,
				name: name ?? null,
				secret: secret ?? null,
				documentsPublished: trigger.includes("documentsPublished") || defaultValue,
				documentsUnpublished: trigger.includes("documentsUnpublished") || defaultValue,
				releasesCreated: trigger.includes("releasesCreated") || defaultValue,
				releasesUpdated: trigger.includes("releasesUpdated") || defaultValue,
				tagsCreated: trigger.includes("tagsCreated") || defaultValue,
				tagsDeleted: trigger.includes("tagsDeleted") || defaultValue,
			},
			{ repo, token, host },
		);
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			throw new CommandError(`Repository not found: ${repo}`);
		}
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to create webhook: ${message}`);
		}
		throw error;
	}

	console.info(`Webhook created: ${webhookUrl}`);
});
