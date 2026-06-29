import * as z from "zod/mini";
import { env } from "../env";

const USER_AGENT = "prismic-cli";

type CustomRequestInit = Omit<RequestInit, "body" | "credentials"> & {
	body?: RequestInit["body"] | Record<PropertyKey, unknown>;
	credentials?: Record<string, string | undefined>;
};

export async function request<T>(
	input: RequestInfo | URL,
	init: CustomRequestInit & { schema?: z.ZodMiniType<T> } = {},
): Promise<T> {
	const { credentials, ...otherInit } = init;

	const headers = new Headers(init.headers);
	if (!headers.has("Accept")) {
		headers.set("Accept", "application/json");
	}
	if (!headers.has("User-Agent")) {
		headers.set("User-Agent", USER_AGENT);
	}
	if (credentials) {
		const cookies: string[] = [];
		for (const key in credentials) {
			cookies.push(`${key}=${credentials[key] ?? ""}`);
		}
		headers.set("Cookie", cookies.join("; "));
	}
	if (!headers.has("Content-Type") && init.body) {
		headers.set("Content-Type", "application/json");
	}
	if (init.body instanceof FormData) {
		headers.delete("Content-Type");
	}

	const body =
		headers.get("Content-Type") === "application/json"
			? JSON.stringify(init.body)
			: (init.body as RequestInit["body"]);

	const response = await fetch(input, { ...otherInit, body, headers });

	const value = await response
		.clone()
		.json()
		.catch(() => response.clone().text());

	if (response.ok) {
		if (init.schema) {
			return z.parse(init.schema, value);
		}

		return value;
	} else {
		if (response.status === 400) throw new BadRequestError(response, value);
		if (response.status === 401) throw new UnauthorizedRequestError(response);
		if (response.status === 403) throw new ForbiddenRequestError(response);
		if (response.status === 404) throw new NotFoundRequestError(response);
		throw new UnknownRequestError(response);
	}
}

export class RequestError extends Error {
	name = "RequestError";
	response: Response;

	constructor(response: Response) {
		super(`fetch failed: ${response.url}`);
		this.response = response;
	}

	async text(): Promise<string> {
		return this.response.clone().text();
	}

	async json(): Promise<unknown> {
		return this.response.clone().json();
	}

	get status(): number {
		return this.response.status;
	}

	get statusText(): string {
		return this.response.statusText;
	}
}

export class UnknownRequestError extends RequestError {
	name = "UnknownRequestError";
}
export class BadRequestError extends RequestError {
	name = "BadRequestError";
	body: unknown;

	constructor(response: Response, body: unknown) {
		super(response);
		this.body = body;
	}
}
export class NotFoundRequestError extends RequestError {
	name = "NotFoundRequestError";

	constructor(response: Response) {
		super(response);
		this.message = "";
	}
}
export class ForbiddenRequestError extends RequestError {
	name = "ForbiddenRequestError";
}
export class UnauthorizedRequestError extends RequestError {
	name = "UnauthorizedRequestError";
}

export function formatAuthErrorMessage(
	error: UnauthorizedRequestError | ForbiddenRequestError,
	options: { hasToken: boolean },
): string {
	if (!options.hasToken) return "Not logged in. Run `prismic login` first.";
	// The status code can't reliably separate "bad token" from "no access": the user
	// service returns 403 for an invalid token, while repository endpoints return 401
	// for a bad token and 403 for no access. So for an env token, cover both causes.
	if (env.PRISMIC_TOKEN) {
		return "PRISMIC_TOKEN is invalid or expired, or doesn't have access to this repository. Unset it to log in with a browser, or replace it with a valid token.";
	}
	if (error instanceof UnauthorizedRequestError) {
		return "Your session is invalid or expired. Run `prismic login` to sign in again.";
	}

	return "You do not have access to this repository. Check the repository name or log in with an account that has access.";
}
