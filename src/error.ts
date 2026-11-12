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

const DEVICE_FLOW_MESSAGES: Record<Exclude<DeviceFlowError["reason"], "misconfigured">, string> = {
	expired: "The login code expired. Run the command again.",
	declined: "The login was declined in the browser.",
	"email-unverified":
		"Prismic sent you an email to verify your address. Verify it, then run the command again.",
	"invalid-grant": "The login code was already used or isn't valid. Run the command again.",
	unavailable:
		"Can't reach the Prismic login service. Check your connection, then run the command again.",
};

export async function getErrorMessage(error: unknown): Promise<string | undefined> {
	if (error instanceof DeviceFlowError) {
		if (error.reason !== "misconfigured") return DEVICE_FLOW_MESSAGES[error.reason];
		return `Login isn't set up correctly for ${await getHost()} (${error.detail}). Report this: https://github.com/prismicio/cli/issues`;
	}

	if (error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError) {
		if (!(await getToken().catch(() => undefined))) {
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

	if (error instanceof Error) {
		return dedent(error.message);
	}
}
