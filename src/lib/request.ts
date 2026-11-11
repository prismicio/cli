import * as z from "zod/mini";

const USER_AGENT = "prismic-cli";

// The user's login token. `renew` is called when a request's token is
// rejected, and resolves to a new token, or to nothing to give up.
export type TokenSource = {
	current: () => string | undefined;
	renew: (error: RequestError) => Promise<string | undefined>;
};

type CustomRequestInit = Omit<RequestInit, "body" | "credentials"> & {
	credentials?: Record<string, string | undefined>;
	// Sends the token as a Bearer header, or in `cookie` if set.
	login?: { token: TokenSource; cookie?: string };
	notFoundMessage?: string;
	unknownErrorMessage?: string;
};

type RequestBody = { body?: BodyInit | null; json?: never } | { body?: never; json?: unknown };

export type RequestOptions<T = unknown> = CustomRequestInit &
	RequestBody & {
		schema?: z.ZodMiniType<T>;
	};

export async function request<T = unknown>(
	input: RequestInfo | URL,
	init: RequestOptions<T> = {},
): Promise<T> {
	const { login, ...options } = init;
	if (!login) return send(input, options);

	const withToken = (token: string | undefined): RequestOptions<T> => {
		if (login.cookie) {
			return { ...options, credentials: { ...options.credentials, [login.cookie]: token } };
		}
		const headers = new Headers(options.headers);
		headers.set("Authorization", `Bearer ${token}`);
		return { ...options, headers };
	};

	try {
		return await send(input, withToken(login.token.current()));
	} catch (error) {
		if (!(error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError)) {
			throw error;
		}
		const token = await login.token.renew(error);
		if (!token) throw error;
		return send(input, withToken(token));
	}
}

async function send<T>(input: RequestInfo | URL, init: RequestOptions<T>): Promise<T> {
	const { credentials, json, notFoundMessage, unknownErrorMessage, schema, ...requestInit } = init;

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
	if ("json" in init && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	const body = "json" in init ? JSON.stringify(json) : init.body;

	const response = await fetch(input, { ...requestInit, body, headers });

	const rawBody = await response.text();
	let value: unknown;
	if (rawBody) {
		try {
			value = JSON.parse(rawBody);
		} catch {
			value = rawBody;
		}
	}

	if (response.ok) {
		return schema ? z.parse(schema, value) : (value as T);
	}

	switch (response.status) {
		case 400:
			throw new BadRequestError(response, value);
		case 401:
			throw new UnauthorizedRequestError(response, value);
		case 403:
			throw new ForbiddenRequestError(response, value);
		case 404:
			throw new NotFoundRequestError(response, value, notFoundMessage);
		default:
			throw new UnknownRequestError(response, value, unknownErrorMessage);
	}
}

export class RequestError extends Error {
	response: Response;
	body: unknown;

	constructor(response: Response, body: unknown, message?: string) {
		super(message);
		this.response = response;
		this.body = body;
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
}
export class NotFoundRequestError extends RequestError {
	name = "NotFoundRequestError";
	constructor(
		response: Response,
		body: unknown,
		message = "The requested resource was not found.",
	) {
		super(response, body, message);
	}
}
export class ForbiddenRequestError extends RequestError {
	name = "ForbiddenRequestError";
}
export class UnauthorizedRequestError extends RequestError {
	name = "UnauthorizedRequestError";
}
