import * as z from "zod/mini";

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
export class NotFoundRequestError extends RequestError {
	name = "NotFoundRequestError";

	constructor(response: Response, message?: string) {
		super(response);
		this.message = message ?? "";
	}
}
export class ForbiddenRequestError extends RequestError {
	name = "ForbiddenRequestError";
}
export class UnauthorizedRequestError extends RequestError {
	name = "UnauthorizedRequestError";
}
