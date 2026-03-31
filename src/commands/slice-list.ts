import { getHost, getToken } from "../auth";
import { getSlices } from "../clients/custom-types";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice list",
	description: "List all slices.",
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { json, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const slices = await getSlices({ repo, token, host });

	if (json) {
		console.info(stringify(slices));
		return;
	}

	if (slices.length === 0) {
		console.info("No slices found.");
		return;
	}

	for (const slice of slices) {
		console.info(`${slice.name} (id: ${slice.id})`);
	}
});
