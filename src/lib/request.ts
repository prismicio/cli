import * as z from "zod/mini";

const USER_AGENT = "prismic-cli";

type CustomRequestInit<T = unknown> = Omit<RequestInit, "body" | "credentials"> & {
	credentials?: Record<string, string | undefined>;
	notFoundMessage?: string;
	unknownErrorMessage?: string;
	onAuthError?: (
		response: Response,
		retry: (initOverrides: Omit<CustomRequestInit<T>, "onAuthError">) => Promise<T>,
	) => Promise<void | T>;
};

type RequestBody = { body?: BodyInit | null; json?: never } | { body?: never; json?: unknown };

export type RequestOptions<T = unknown> = CustomRequestInit<T> &
	RequestBody & {
		schema?: z.ZodMiniType<T>;
	};

export async function request<T = unknown>(
	input: RequestInfo | URL,
	init: RequestOptions<T> = {},
): Promise<T> {
	const {
		credentials,
		json,
		notFoundMessage,
		unknownErrorMessage,
		onAuthError,
		schema,
		...requestInit
	} = init;

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
		case 401: {
			if (onAuthError) {
				const x = await onAuthError(response, async (initOverrides) => {
					const retryHeaders = new Headers(init.headers);
					new Headers(initOverrides.headers).forEach((value, key) => {
						retryHeaders.set(key, value);
					});
					return await request<T>(input, {
						...init,
						...initOverrides,
						headers: retryHeaders,
						credentials: initOverrides.credentials
							? { ...credentials, ...initOverrides.credentials }
							: credentials,
						onAuthError: undefined,
					});
				});
			}
			throw new UnauthorizedRequestError(response, value);
		}
		case 403: {
			throw new ForbiddenRequestError(response, value);
		}
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
