import { getHost, getToken } from "../auth";
import { getWebhooks } from "../clients/wroom";
import { createCommand, defineCommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getRepositoryName } from "../project";

const config = defineCommandConfig({
	name: "webhook list",
	description: `List all webhooks in a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.`,
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
});

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName(), json } = values;

	const token = await getToken();
	const host = await getHost();
	const webhooks = await getWebhooks({ repo, token, host });

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
