import { getAuthenticationApiUrl, getGuest, getHost, getToken, onUnauthorized } from "../auth";
import { openBrowser } from "../lib/browser";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { isInvalidAuthContextError } from "../lib/prismic/auth";
import { createGuestLink, getRepository, getRepositoryApiAccess } from "../lib/prismic/client";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic repo view",
	description: `
		View details of a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.

		On a temporary account, --web logs you in before it opens the repository.
	`,
	options: {
		web: { type: "boolean", short: "w", description: "Open repository in browser" },
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName(), web, json } = values;

	const host = await getHost();
	const url = `https://${repo}.${host}/`;

	if (web) {
		let link = url;
		if (await getGuest()) {
			({ url: link } = await createGuestLink({
				authenticationUrl: getAuthenticationApiUrl(host),
				redirectUri: url,
				getToken,
				onUnauthorized,
			}));
		}
		// openBrowser() runs a shell, so a link from Prismic can't contain shell
		// syntax, including cmd.exe's %NAME%.
		if (link === url || (/^https:\/\/[\w\-.:/?=&~+]+$/.test(link) && URL.canParse(link))) {
			openBrowser(new URL(link));
		}
		console.info(`Opening ${link}`);
		return;
	}

	const [repository, syncState] = await Promise.all([
		getRepository({ repo, getToken, host, onUnauthorized }),
		getRepositoryApiAccess({ repo, getToken, host, onUnauthorized }).catch((error) => {
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
