import { getHost, getToken } from "../auth";
import { getWebhooks } from "../clients/wroom";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { formatTable } from "../lib/string";
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
	const webhooks = await getWebhooks({ repo, token, host });

	if (json) {
		console.info(stringify(webhooks.map((webhook) => webhook.config)));
		return;
	}

	if (webhooks.length === 0) {
		console.info("No webhooks configured.");
		return;
	}

	const rows = webhooks.map((webhook) => {
		const status = webhook.config.active ? "enabled" : "disabled";
		const name = webhook.config.name ? ` (${webhook.config.name})` : "";
		return [`${webhook.config.url}${name}`, `[${status}]`];
	});
	console.info(formatTable(rows, { headers: ["URL", "STATUS"] }));
});
