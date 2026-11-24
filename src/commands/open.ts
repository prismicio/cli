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

		With a temporary account, this command opens no browser. It prints a link
		that logs in to the account and works once.
	`,
	agents: `
		Give a temporary account's link to the user. Do not fetch it: that uses it
		up. Use --no-browser when the user's browser is on another machine.
	`,
	options: {
		dashboard: { type: "boolean", description: "Open the dashboard instead of the repository" },
		"no-browser": { type: "boolean", description: "Skip opening the browser automatically" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const host = await getHost();
	const repo = values.dashboard ? undefined : await getRepositoryName().catch(() => undefined);
	const url = repo ? `https://${repo}.${host}/` : `https://${host}/dashboard`;

	if (!(await getGuest())) {
		if (values["no-browser"]) {
			console.info(url);
		} else {
			openBrowser(new URL(url));
			console.info(`Opening ${url}`);
		}
		return;
	}

	// The link works once, so a browser on this machine would use it up for a
	// user on another one.
	try {
		const link = await createGuestLink({
			authenticationUrl: getAuthenticationApiUrl(host),
			redirectUri: repo && url,
			getToken,
			onUnauthorized,
		});
		console.info(link.url);
		console.warn("This link logs in to your temporary account. It works once.");
	} catch (error) {
		if (!(error instanceof BadRequestError)) throw error;
		const reason = (error.body as { error?: string } | undefined)?.error;
		console.info(url);
		console.warn(`Prismic can't log in to this page (${reason}), so the link opens logged out.`);
	}
});
