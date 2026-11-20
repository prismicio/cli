import { getAuthenticationApiUrl, getHost, getToken, isPerson, onUnauthorized } from "../auth";
import { readLoginSummary } from "../credentials";
import { env } from "../env";
import { openBrowser } from "../lib/browser";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { createGuestLink } from "../lib/prismic/client";

const config = {
	name: "prismic open",
	description: `
		Open your temporary account in a browser. There, you can keep its
		repositories by signing up or logging in.
	`,
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const host = await getHost();
	const summary = await readLoginSummary();
	if (env.PRISMIC_TOKEN || !summary.guest || summary.host !== host) {
		throw new CommandError(
			`\`prismic open\` works only for an account started without signing up. Open https://${host}/dashboard instead.`,
		);
	}

	const { url } = await createGuestLink({
		authenticationUrl: getAuthenticationApiUrl(host),
		getToken,
		onUnauthorized,
	});
	console.info(`Open this link within 10 minutes. It works once:\n  ${url}`);
	// openBrowser() runs a shell, so the URL can't contain shell syntax,
	// including cmd.exe's %NAME%.
	if (isPerson() && /^https:\/\/[\w\-.:/?=&~+]+$/.test(url) && URL.canParse(url)) {
		openBrowser(new URL(url));
	}
});
