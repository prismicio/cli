import { getHost, getToken } from "../auth";
import { getPreviews, getSimulatorUrl } from "../clients/core";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { formatTable } from "../lib/string";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic preview list",
	description: `
		List all preview configurations in a Prismic repository.

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

	const [previews, simulatorUrl] = await Promise.all([
		getPreviews({ repo, token, host }),
		getSimulatorUrl({ repo, token, host }),
	]);

	if (json) {
		console.info(
			stringify({
				previews,
				simulatorUrl: simulatorUrl ?? null,
			}),
		);
		return;
	}

	if (previews.length === 0 && !simulatorUrl) {
		console.info("No preview configurations found.");
		return;
	}

	const rows = previews.map((preview) => [preview.url, preview.label]);
	console.info(formatTable(rows, { headers: ["URL", "LABEL"] }));

	if (simulatorUrl) {
		console.info(`\nSimulator: ${simulatorUrl}`);
	}
});
