import { getCredentials } from "../auth";
import { openBrowser } from "../lib/browser";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getRepository } from "../lib/prismic/clients/repository";
import { getRepositoryAccess } from "../lib/prismic/clients/wroom";
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

	const [repository, access] = await Promise.all([
		getRepository({ repo, token, host }),
		getRepositoryAccess({ repo, token, host }),
	]);

	if (json) {
		console.info(
			stringify({
				domain: repo,
				name: repository.name ?? null,
				url,
				apiAccess: access,
			}),
		);
		return;
	}

	const name = repository.name || "(no name)";
	console.info(`Name: ${name}`);
	console.info(`URL: ${url}`);
	console.info(`Content API: ${access}`);
});
