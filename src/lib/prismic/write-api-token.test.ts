import { expect, it } from "vitest";

import { readWriteApiToken } from "./write-api-token";

function jwt(payload: unknown): string {
	const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
	return `eyJhbGciOiJub25lIn0.${encoded}.sig`;
}

it("reads the repository and app from a Write API token", () => {
	expect(readWriteApiToken(jwt({ domain: "example", appName: "CLI", exp: 1 }))).toEqual({
		domain: "example",
		appName: "CLI",
	});
});

it("returns undefined when the token is missing", () => {
	expect(readWriteApiToken(undefined)).toBeUndefined();
	expect(readWriteApiToken("")).toBeUndefined();
});

it("returns undefined for a user session", () => {
	expect(readWriteApiToken(jwt({ email: "ada@example.com", exp: 1 }))).toBeUndefined();
});

it("returns undefined when either claim is missing or empty", () => {
	expect(readWriteApiToken(jwt({ domain: "example" }))).toBeUndefined();
	expect(readWriteApiToken(jwt({ appName: "CLI" }))).toBeUndefined();
	expect(readWriteApiToken(jwt({ domain: "", appName: "CLI" }))).toBeUndefined();
	expect(readWriteApiToken(jwt({ domain: "example", appName: "" }))).toBeUndefined();
});

it("returns undefined when a claim is not a string", () => {
	expect(readWriteApiToken(jwt({ domain: "example", appName: 1 }))).toBeUndefined();
});

it("returns undefined for a token that is not a JWT", () => {
	expect(readWriteApiToken("not-a-jwt")).toBeUndefined();
});
