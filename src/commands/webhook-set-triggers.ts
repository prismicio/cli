import { getHost, getToken } from "../auth";
import { getWebhooks, updateWebhook, WEBHOOK_TRIGGERS } from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic webhook set-triggers",
	description: `
		Update which events trigger a webhook.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		url: { description: "Webhook URL" },
	},
	options: {
		trigger: {
			type: "string",
			multiple: true,
			short: "t",
			description: "Trigger events (can be repeated, at least one required)",
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
		`,
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [webhookUrl] = positionals;
	const { repo = await getRepositoryName(), trigger = [] } = values;

	if (!webhookUrl) {
		throw new CommandError("Missing required argument: <url>");
	}

	if (trigger.length === 0) {
		throw new CommandError("Missing required option: --trigger");
	}

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
	const webhooks = await getWebhooks({ repo, token, host });
	const webhook = webhooks.find((w) => w.config.url === webhookUrl);
	if (!webhook) {
		throw new CommandError(`Webhook not found: ${webhookUrl}`);
	}

	const id = webhook.config._id;

	try {
		await updateWebhook(
			id,
			{
				...webhook.config,
				documentsPublished: trigger.includes("documentsPublished"),
				documentsUnpublished: trigger.includes("documentsUnpublished"),
				releasesCreated: trigger.includes("releasesCreated"),
				releasesUpdated: trigger.includes("releasesUpdated"),
				tagsCreated: trigger.includes("tagsCreated"),
				tagsDeleted: trigger.includes("tagsDeleted"),
			},
			{ repo, token, host },
		);
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to update webhook triggers: ${message}`);
		}
		throw error;
	}

	console.info(`Webhook triggers updated: ${trigger.join(", ")}`);
});
