import { getHost, getToken } from "../auth";
import { getWebhooks } from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { NotFoundRequestError, UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic webhook list",
	description: `
		List all webhooks in a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName(), json } = values;

	const token = await getToken();
	const host = await getHost();
	let webhooks;
	try {
		webhooks = await getWebhooks({ repo, token, host });
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			throw new CommandError(`Repository not found: ${repo}`);
		}
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to list webhooks: ${message}`);
		}
		throw error;
	}

	if (json) {
		console.info(stringify(webhooks.map((webhook) => webhook.config)));
		return;
	}

	if (webhooks.length === 0) {
		console.info("No webhooks configured.");
		return;
	}

	for (const webhook of webhooks) {
		const status = webhook.config.active ? "enabled" : "disabled";
		const name = webhook.config.name ? ` (${webhook.config.name})` : "";
		console.info(`${webhook.config.url}${name}  [${status}]`);
	}
});
