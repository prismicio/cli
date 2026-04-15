import { getHost, getToken } from "../auth";
import { getCustomTypes } from "../clients/custom-types";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { formatTable } from "../lib/string";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic type list",
	description: "List all content types.",
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { json, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();

	const types = await getCustomTypes({ repo, token, host });

	if (json) {
		console.info(stringify(types));
		return;
	}

	if (types.length === 0) {
		console.info("No types found.");
		return;
	}

	const rows = types.map((type) => {
		const label = type.label || "(no name)";
		return [label, type.id, type.format ?? ""];
	});
	console.info(formatTable(rows, { headers: ["NAME", "ID", "FORMAT"] }));
});
