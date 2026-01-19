import * as v from "valibot";

import { readToken } from "./auth";

type CustomRequestInit = Omit<RequestInit, "body"> & {
	body?: RequestInit["body"] | Record<PropertyKey, unknown>;
};

export type RequestResponse<T> =
	| { ok: true; value: T }
	| { ok: false; value: unknown; error: RequestError | ForbiddenRequestError };
export type ParsedRequestResponse<T> =
	| RequestResponse<T>
	| { ok: false; value: unknown; error: v.ValiError<v.GenericSchema<T>> };

export async function request<T>(
	input: RequestInfo | URL,
	init?: CustomRequestInit,
): Promise<RequestResponse<T>>;
export async function request<T>(
	input: RequestInfo | URL,
	init: CustomRequestInit & { schema: v.GenericSchema<T> },
): Promise<ParsedRequestResponse<T>>;
export async function request<T>(
	input: RequestInfo | URL,
	init: CustomRequestInit & { schema?: v.GenericSchema<T> } = {},
): Promise<ParsedRequestResponse<T>> {
	const { credentials = "include" } = init;

	const headers = new Headers(init.headers);
	if (credentials === "include") {
		const token = await readToken();
		if (token) headers.set("Cookie", `prismic-auth=${token}`);
	}
	if (!headers.has("Content-Type") && init.body) {
		headers.set("Content-Type", "application/json");
	}

	const body =
		headers.get("Content-Type") === "application/json"
			? JSON.stringify(init.body)
			: (init.body as RequestInit["body"]);

	const response = await fetch(input, { ...init, body, headers });

	const value = await response
		.clone()
		.json()
		.catch(() => response.clone().text());

	if (response.ok) {
		if (!init?.schema) return { ok: true, value };

		try {
			const parsed = v.parse(init.schema, value);
			return { ok: true, value: parsed };
		} catch (error) {
			if (v.isValiError<v.GenericSchema<T>>(error)) {
				return { ok: false, value, error };
			}
			throw error;
		}
	} else {
		if (response.status === 403) {
			const error = new ForbiddenRequestError(response);
			return { ok: false, value, error };
		} else {
			const error = new RequestError(response);
			return { ok: false, value, error };
		}
	}
}

class RequestError extends Error {
	name = "RequestError" as const;
	response: Response;

	constructor(response: Response) {
		super(`fetch failed: ${response.url}`);
		this.response = response;
	}

	async text() {
		return this.response.clone().text();
	}

	async json() {
		return this.response.clone().json();
	}

	get status() {
		return this.response.status;
	}

	get statusText() {
		return this.response.statusText;
	}
}

export class ForbiddenRequestError extends RequestError {}

export function isRequestError(error: unknown): error is RequestError {
	return error instanceof RequestError;
}
