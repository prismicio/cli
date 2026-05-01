import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices } from "../clients/custom-types";
import { createCommand, type CommandConfig } from "../lib/command";
import { getRepositoryName, writeSnapshot } from "../project";

const config = {
	name: "prismic fetch",
	description: `
		Refresh the snapshot of remote types and slices without modifying local files.

		Run this after cloning a project to establish a baseline so push and pull
		can detect drift correctly.
	`,
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();

	console.info(`Fetching snapshot for repository: ${repo}`);

	const [customTypes, slices] = await Promise.all([
		getCustomTypes({ repo, token, host }),
		getSlices({ repo, token, host }),
	]);
	await writeSnapshot(repo, { customTypes, slices });

	console.info("Fetch complete.");
});
