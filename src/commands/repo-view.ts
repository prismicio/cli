import { getHost, getToken } from "../auth";
import { getProfile } from "../clients/user";
import { getRepositoryAccess } from "../clients/wroom";
import { openBrowser } from "../lib/browser";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { UnknownRequestError } from "../lib/request";
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

	const token = await getToken();
	const host = await getHost();
	const url = `https://${repo}.${host}/`;

	if (web) {
		openBrowser(new URL(url));
		console.info(`Opening ${url}`);
		return;
	}

	let profile;
	let access;
	try {
		[profile, access] = await Promise.all([
			getProfile({ token, host }),
			getRepositoryAccess({ repo, token, host }),
		]);
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to fetch repository details: ${message}`);
		}
		throw error;
	}

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
