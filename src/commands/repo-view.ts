import { getCredentials } from "../auth";
import { openBrowser } from "../lib/browser";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { isInvalidAuthContextError } from "../lib/prismic/auth";
import { getRepository, getRepositoryApiAccess } from "../lib/prismic/client";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic repo view",
	description: `
		View details of a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	options: {
		web: { type: "boolean", short: "w", description: "Open repository in browser" },
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName(), web, json } = values;

	const { token, host } = await getCredentials();
	const url = `https://${repo}.${host}/`;

	if (web) {
		openBrowser(new URL(url));
		console.info(`Opening ${url}`);
		return;
	}

	const [repository, syncState] = await Promise.all([
		getRepository({ repo, token, host }),
		getRepositoryApiAccess({ repo, token, host }).catch((error) => {
			if (!isInvalidAuthContextError(error)) throw error;
		}),
	]);

	if (json) {
		console.info(
			stringify({
				domain: repo,
				name: repository.name ?? null,
				url,
				apiAccess: syncState?.repository.api_access ?? null,
			}),
		);
		return;
	}

	const name = repository.name || "(no name)";
	console.info(`Name: ${name}`);
	console.info(`URL: ${url}`);
	console.info(`Content API: ${syncState?.repository.api_access ?? "(unavailable)"}`);
});
