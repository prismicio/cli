// Temporary. This unit test covers what happens right after a login until
// `prismic login` uses it. C4, the PR that switches `prismic login` to the
// device flow, deletes this file and tests login end to end instead.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { afterEach, vi } from "vitest";

import { it } from "./it";

// src/env.ts requires PROD, which the build defines. Vitest sets it to "".
process.env.PROD = "false";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

it("reads the profile once and forgets the tracked user", async ({ expect, home, host, token }) => {
	const analyticsPath = new URL("analytics.json", home);
	await writeFile(analyticsPath, JSON.stringify({ anonymousId: "anonymous", userId: "user" }));
	const fetch = vi.spyOn(globalThis, "fetch");
	// Imports src/auth.ts as a new process would, with its own config directory.
	vi.resetModules();
	vi.stubEnv("PRISMIC_CONFIG_DIR", fileURLToPath(home));
	const { finishLogin } = await import("../src/auth");

	const { email } = await finishLogin({ token, host });

	expect(email).toBe(process.env.E2E_PRISMIC_EMAIL);
	expect(fetch).toHaveBeenCalledOnce();
	expect(String(fetch.mock.calls[0][0])).toBe(`https://api.internal.${host}/user/profile`);
	expect(JSON.parse(await readFile(analyticsPath, "utf8"))).toEqual({ anonymousId: "anonymous" });
});
