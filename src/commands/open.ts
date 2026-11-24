import { getAuthenticationApiUrl, getGuest, getHost, getToken, onUnauthorized } from "../auth";
import { openBrowser } from "../lib/browser";
import { createCommand, type CommandConfig } from "../lib/command";
import { createGuestLink } from "../lib/prismic/client";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic open",
	description: `
		Open the project's repository in a browser, or the dashboard outside a
		project. A temporary account opens logged in.
	`,
	options: {
		dashboard: { type: "boolean", description: "Open the dashboard, even inside a project" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const host = await getHost();
	const repo = values.dashboard ? undefined : await getRepositoryName().catch(() => undefined);
	let url = repo ? `https://${repo}.${host}/` : `https://${host}/dashboard`;
	if (await getGuest()) {
		({ url } = await createGuestLink({
			authenticationUrl: getAuthenticationApiUrl(host),
			redirectUri: url,
			getToken,
			onUnauthorized,
		}));
	}

	console.info(`Opening ${url}`);
	// openBrowser() runs a shell, so the URL can't contain shell syntax,
	// including cmd.exe's %NAME%.
	if (/^https:\/\/[\w\-.:/?=&~+]+$/.test(url) && URL.canParse(url)) openBrowser(new URL(url));
});
