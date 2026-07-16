import { getCredentials } from "../auth";
import { openBrowser } from "../lib/browser";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getProfile } from "../lib/prismic/clients/user";
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

	const [profile, access] = await Promise.all([
		getProfile({ token, host }),
		getRepositoryAccess({ repo, token, host }),
	]);

	const repoData = profile.repositories.find((r) => r.domain === repo);
	if (!repoData) {
		throw new CommandError(`Repository not found: ${repo}`);
	}

	if (json) {
		console.info(
			stringify({
				domain: repoData.domain,
				name: repoData.name ?? null,
				url,
				apiAccess: access,
			}),
		);
		return;
	}

	const name = repoData.name || "(no name)";
	console.info(`Name: ${name}`);
	console.info(`URL: ${url}`);
	console.info(`Content API: ${access}`);
});
