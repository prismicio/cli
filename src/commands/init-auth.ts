import type { Profile } from "../lib/prismic/clients/user";

import { createLoginSession, getCredentials } from "../auth";
import { env } from "../env";
import { openBrowser } from "../lib/browser";
import { CommandError } from "../lib/command";
import { getProfile } from "../lib/prismic/clients/user";
import { ForbiddenRequestError, UnauthorizedRequestError } from "../lib/request";

export async function authenticateInit(
	noBrowser: boolean | undefined,
): Promise<{ host: string; token: string | undefined; profile: Profile }> {
	const { host, token: initialToken } = await getCredentials();
	let token = initialToken;
	let profile: Profile;

	try {
		profile = await getProfile({ token, host });
	} catch (error) {
		if (!(error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError)) {
			throw error;
		}
		if (env.PRISMIC_TOKEN) {
			throw new CommandError(
				"PRISMIC_TOKEN is invalid or expired. Unset it to log in with a browser, or replace it with a valid token.",
			);
		}

		console.info("Not logged in. Starting login...");
		const { email } = await createLoginSession({
			onReady: (url) => {
				if (noBrowser) {
					console.info(`Open this URL to log in: ${url}`);
				} else {
					console.info("Opening browser to complete login...");
					console.info(`If the browser doesn't open, visit: ${url}`);
					openBrowser(url);
				}
			},
		});
		console.info(`Logged in as ${email}`);

		const loggedIn = await getCredentials();
		token = loggedIn.token;
		profile = await getProfile({ token, host });
	}

	return { host, token, profile };
}
