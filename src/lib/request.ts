import * as z from "zod/mini";

const USER_AGENT = "prismic-cli";

export type RequestOptions<T = unknown> = Omit<RequestInit, "body"> & {
	schema?: z.ZodMiniType<T>;
	notFoundMessage?: string;
	unknownErrorMessage?: string;
	onUnauthorized?: UnauthorizedHandler;
} & ({ body?: BodyInit | null; json?: never } | { body?: never; json?: unknown });

export type UnauthorizedHandler = <T>(
	retry: (init?: Pick<RequestInit, "headers">) => Promise<T>,
	sent: Headers,
) => Promise<T | undefined>;

export async function request<T = unknown>(
	input: RequestInfo | URL,
	init: RequestOptions<T> = {},
): Promise<T> {
	const { json, notFoundMessage, unknownErrorMessage, schema, onUnauthorized, ...requestInit } =
		init;

	const headers = new Headers(init.headers);
	if (!headers.has("Accept")) {
		headers.set("Accept", "application/json");
	}
	if (!headers.has("User-Agent")) {
		headers.set("User-Agent", USER_AGENT);
	}
	if ("json" in init && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	const body = "json" in init ? JSON.stringify(json) : init.body;

	const response = await fetch(input, { ...requestInit, body, headers }).catch((error) => {
		// fetch throws this when the server can't be reached: offline, DNS, refused connection.
		if (error instanceof TypeError && error.message === "fetch failed") {
			throw new NetworkError(error.message, { cause: error });
		}
		throw error;
	});

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
		case 403: {
			let retried = false;
			const result = await onUnauthorized?.((retryInit) => {
				retried = true;
				const retryHeaders = new Headers(headers);
				new Headers(retryInit?.headers).forEach((value, key) => retryHeaders.set(key, value));
				return request(input, { ...init, headers: retryHeaders, onUnauthorized: undefined });
			}, headers);
			if (retried) return result as T;
			if (response.status === 401) throw new UnauthorizedRequestError(response, value);
			throw new ForbiddenRequestError(response, value);
		}
		case 404:
			throw new NotFoundRequestError(response, value, notFoundMessage);
		default:
			throw new UnknownRequestError(response, value, unknownErrorMessage);
	}
}

export class NetworkError extends Error {
	name = "NetworkError";
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
