import { describe, expect, it } from "vitest";

import {
	ForbiddenRequestError,
	formatAuthErrorMessage,
	UnauthorizedRequestError,
} from "../src/lib/request";

function mockResponse(status: number): Response {
	return new Response(null, { status, statusText: status === 401 ? "Unauthorized" : "Forbidden" });
}

describe("formatAuthErrorMessage", () => {
	it("returns not logged in when unauthorized without a token", () => {
		const error = new UnauthorizedRequestError(mockResponse(401));
		expect(formatAuthErrorMessage(error, { hasToken: false })).toBe(
			"Not logged in. Run `prismic login` first.",
		);
	});

	it("returns invalid PRISMIC_TOKEN when unauthorized with env token", () => {
		const error = new UnauthorizedRequestError(mockResponse(401));
		expect(formatAuthErrorMessage(error, { hasToken: true, envToken: "bad-token" })).toBe(
			"PRISMIC_TOKEN is invalid or expired. Unset it to log in with a browser, or replace it with a valid token.",
		);
	});

	it("returns expired session when unauthorized with stored token", () => {
		const error = new UnauthorizedRequestError(mockResponse(401));
		expect(formatAuthErrorMessage(error, { hasToken: true })).toBe(
			"Your session is invalid or expired. Run `prismic login` to sign in again.",
		);
	});

	it("returns not logged in when forbidden without a token", () => {
		const error = new ForbiddenRequestError(mockResponse(403));
		expect(formatAuthErrorMessage(error, { hasToken: false })).toBe(
			"Not logged in. Run `prismic login` first.",
		);
	});

	it("returns invalid PRISMIC_TOKEN when forbidden with env token", () => {
		const error = new ForbiddenRequestError(mockResponse(403));
		expect(formatAuthErrorMessage(error, { hasToken: true, envToken: "bad-token" })).toBe(
			"PRISMIC_TOKEN is invalid or expired. Unset it to log in with a browser, or replace it with a valid token.",
		);
	});

	it("returns access denied for forbidden with a token", () => {
		const error = new ForbiddenRequestError(mockResponse(403));
		expect(formatAuthErrorMessage(error, { hasToken: true })).toBe(
			"You do not have access to this repository. Check the repository name or log in with an account that has access.",
		);
	});
});
