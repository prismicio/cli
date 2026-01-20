import * as v from "valibot";

import { readToken } from "./auth";

type CustomRequestInit = Omit<RequestInit, "body"> & {
	body?: RequestInit["body"] | Record<PropertyKey, unknown>;
};

export type RequestResponse<T> = SuccessfulRequestResponse<T> | FailedRequestResponse;
export type ParsedRequestResponse<T> =
	| RequestResponse<T>
	| { ok: false; value: unknown; error: v.ValiError<v.GenericSchema<T>> };
export type SuccessfulRequestResponse<T> = { ok: true; value: T };
export type FailedRequestResponse = {
	ok: false;
	value: unknown;
	error: RequestError | ForbiddenRequestError | UnauthorizedRequestError;
};
export type FailedParsedRequestResponse<T> =
	| FailedRequestResponse
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
	headers.set("Accept", "application/json");
	if (credentials === "include") {
		const token = await readToken();
		if (token) headers.set("Cookie", `SESSION=fake_session; prismic-auth=${token}`);
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
		if (response.status === 401) {
			const error = new UnauthorizedRequestError(response);
			return { ok: false, value, error };
		} else if (response.status === 403) {
			const error = new ForbiddenRequestError(response);
			return { ok: false, value, error };
		} else {
			const error = new RequestError(response);
			return { ok: false, value, error };
		}
	}
}

export class RequestError extends Error {
	name = "RequestError" as const;
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

export class ForbiddenRequestError extends RequestError {}

export class UnauthorizedRequestError extends RequestError {}
