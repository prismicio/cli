import { getAuthenticationApiUrl, getGuest, getHost, getToken, onUnauthorized } from "../auth";
import { openBrowser } from "../lib/browser";
import { createCommand, type CommandConfig } from "../lib/command";
import { createGuestLink } from "../lib/prismic/client";
import { BadRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic open",
	description: `
		Open a Prismic repository in a browser and print its URL.

		By default, this command opens the repository from prismic.config.json at
		the project root. Outside a project, or with --dashboard, it opens the
		dashboard.

		With a temporary account, the URL logs the browser in. It works once.
	`,
	agents: `
		The browser opens on the machine this command runs on. If the user is on
		another machine, give them the printed URL instead. Do not fetch a
		temporary account's URL: that uses it up, and the user can no longer open
		it.
	`,
	options: {
		dashboard: { type: "boolean", description: "Open the dashboard instead of the repository" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const host = await getHost();
	const repo = values.dashboard ? undefined : await getRepositoryName().catch(() => undefined);
	let url = repo ? `https://${repo}.${host}/` : `https://${host}/dashboard`;
	if (await getGuest()) {
		try {
			({ url } = await createGuestLink({
				authenticationUrl: getAuthenticationApiUrl(host),
				redirectUri: repo && url,
				getToken,
				onUnauthorized,
			}));
		} catch (error) {
			if (!(error instanceof BadRequestError)) throw error;
			const reason = (error.body as { error?: string } | undefined)?.error;
			console.warn(`Prismic can't open ${url} logged in (${reason}), so it opens logged out.`);
		}
	}

	console.info(`Opening ${url}`);
	// openBrowser() runs a shell, so the URL can't contain shell syntax,
	// including cmd.exe's %NAME%.
	if (/^https:\/\/[\w\-.:/?=&~+]+$/.test(url) && URL.canParse(url)) openBrowser(new URL(url));
});
