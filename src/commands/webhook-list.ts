import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getWebhooks } from "../lib/prismic/clients/wroom";
import { formatTable } from "../lib/string";

const config = {
	name: "prismic webhook list",
	description: `
		List all webhooks in a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: { type: "string", short: "e", description: "(deprecated) Alias for --repo" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const {
		env,
		repo = env ?? (await getActiveRepositoryName()),
		json,
	} = values;

	const { token, host } = await getCredentials();
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
