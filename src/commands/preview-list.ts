import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getPreviews, getSimulatorUrl } from "../lib/prismic/clients/core";
import { formatTable } from "../lib/string";

const config = {
	name: "prismic preview list",
	description: `
		List all preview configurations in a Prismic repository.

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
