import { getHost, getToken } from "../auth";
import { getCustomTypes } from "../clients/custom-types";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic page-type list",
	description: "List all page types.",
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { json, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();

	const customTypes = await getCustomTypes({ repo, token, host });
	const pageTypes = customTypes.filter((customType) => customType.format === "page");

	if (json) {
		console.info(stringify(pageTypes));
		return;
	}

	if (pageTypes.length === 0) {
		console.info("No page types found.");
		return;
	}

	for (const pageType of pageTypes) {
		const label = pageType.label || "(no name)";
		console.info(`${label} (id: ${pageType.id})`);
	}
});
