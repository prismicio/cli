import * as z from "zod/mini";

export type RequestOptions<T = unknown> = Omit<RequestInit, "body" | "credentials"> &
	({ body?: BodyInit | null; json?: never } | { body?: never; json?: unknown }) & {
		credentials?: Record<string, string | undefined>;
		notFoundMessage?: string;
		unknownErrorMessage?: string;
		schema?: z.ZodMiniType<T>;
	};

export async function request<T = unknown>(
	input: RequestInfo | URL,
	init: RequestOptions<T> = {},
): Promise<T> {
	const { credentials, json, notFoundMessage, unknownErrorMessage, schema, ...requestInit } = init;

	const headers = new Headers(init.headers);
	if (!headers.has("Accept")) headers.set("Accept", "application/json");
	if (!headers.has("User-Agent")) headers.set("User-Agent", "prismic-cli");
	if (credentials) {
		const cookies = Object.entries(credentials).map(([key, value]) => `${key}=${value ?? ""}`);
		headers.set("Cookie", cookies.join("; "));
	}
	if ("json" in init && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	const body = "json" in init ? JSON.stringify(json) : init.body;
	const response = await fetch(input, { ...requestInit, body, headers });

	const text = await response.text();
	let value: unknown;
	if (text) {
		try {
			value = JSON.parse(text);
		} catch {
			value = text;
		}
	}

	if (response.ok) return schema ? z.parse(schema, value) : (value as T);

	switch (response.status) {
		case 400:
			throw new BadRequestError(response, value);
		case 401:
			throw new UnauthorizedRequestError(response, value);
		case 403:
			throw new ForbiddenRequestError(response, value);
		case 404:
			throw new NotFoundRequestError(
				response,
				value,
				notFoundMessage ?? "The requested resource was not found.",
			);
		default:
			throw new UnknownRequestError(response, value, unknownErrorMessage);
	}
}

class RequestError extends Error {
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
}
export class ForbiddenRequestError extends RequestError {
	name = "ForbiddenRequestError";
}
export class UnauthorizedRequestError extends RequestError {
	name = "UnauthorizedRequestError";
}
