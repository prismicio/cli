import { getCredentials } from "./auth";
import { env } from "./env";
import {
	BadRequestError,
	ForbiddenRequestError,
	UnauthorizedRequestError,
	UnknownRequestError,
} from "./lib/request";
import { dedent } from "./lib/string";

export async function getErrorMessage(error: unknown): Promise<string | undefined> {
	if (error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError) {
		const { token } = await getCredentials();
		if (!token) {
			return "Not logged in. Run `prismic login` first.";
		}
		if (env.PRISMIC_TOKEN) {
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

	if (error instanceof Error) {
		return dedent(error.message);
	}
}
