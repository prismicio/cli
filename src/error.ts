import { getHost, getToken } from "./auth";
import { env } from "./env";
import { DeviceFlowError } from "./lib/auth0";
import { isInvalidAuthContextError } from "./lib/prismic/auth";
import {
	BadRequestError,
	ForbiddenRequestError,
	UnauthorizedRequestError,
	UnknownRequestError,
} from "./lib/request";
import { dedent } from "./lib/string";

export async function getErrorMessage(error: unknown): Promise<string | undefined> {
	if (error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError) {
		if (!(await getToken())) {
			return "Not logged in. Run `prismic login` first.";
		}
		if (env.PRISMIC_TOKEN) {
			if (isInvalidAuthContextError(error)) {
				return "This token cannot run administrative commands. Unset PRISMIC_TOKEN and run `prismic login`.";
			}
			return "PRISMIC_TOKEN is invalid or expired, or doesn't have access to this repository. Unset it to log in with a browser, or replace it with a valid token.";
		}
		if (error instanceof UnauthorizedRequestError) {
			return "Your session is invalid or expired. Run `prismic login` to sign in again.";
		}
		return "You do not have access to this repository. Check the repository name or log in with an account that has access.";
	}

	if (error instanceof BadRequestError || error instanceof UnknownRequestError) {
		const url = new URL(error.response.url);
		// Prevent logging sensitive data like a token
		url.search = "";
		const context = error.message ? `${error.message}\n\n` : "";
		return dedent`
			${context}Prismic responded with an unexpected error. Try again, and report it if it keeps happening.

			  Status:  ${error.status} ${error.statusText}
			  URL:     ${url}
			  Report:  https://github.com/prismicio/cli/issues
		`;
	}

	if (error instanceof DeviceFlowError) {
		switch (error.reason) {
			case "expired":
				return "The login code expired. Run the command again.";
			case "declined":
				return "The login was declined in the browser.";
			case "email-unverified":
				return "Prismic sent you an email to verify your address. Verify it, then run the command again.";
			case "invalid-grant":
				return "The login code is no longer valid. Run the command again.";
			case "misconfigured":
				return `Login isn't set up correctly for ${await getHost()} (${error.detail}). Report this.`;
			case "unavailable":
				return `Can't reach the login service for ${await getHost()} (${error.detail}). Try again in a few minutes.`;
		}
	}

	if (error instanceof Error) {
		return dedent(error.message);
	}
}
