import { getHost, getToken } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getPreviews, getSimulatorUrl } from "../lib/prismic/clients/core";
import { resolveEnvironment } from "../lib/prismic/environments";
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
		env: { type: "string", short: "e", description: "Environment domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo: parentRepo = await getRepositoryName(), env, json } = values;

	const token = await getToken();
	const host = await getHost();
	const repo = env ? await resolveEnvironment(env, { repo: parentRepo, token, host }) : parentRepo;

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

	if (previews.length > 0) {
		const rows = previews.map((preview) => [preview.url, preview.label]);
		console.info(formatTable(rows, { headers: ["URL", "NAME"] }));
	}

	if (simulatorUrl) {
		if (previews.length > 0) {
			console.info("");
		}
		console.info(`Simulator: ${simulatorUrl}`);
	}
});
