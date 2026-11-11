// Temporary. These unit tests cover the login details on the End event until
// commands send them. C4, the PR that switches `prismic login` to the device
// flow, deletes this file and tests them end to end instead.

import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, vi } from "vitest";

import type { FallbackReason, StoreMode } from "../src/credentials";
import { it } from "./it";

// Replaces Segment, so tests never send events.
const events = vi.hoisted(() => [] as { event: string; properties?: Record<string, unknown> }[]);

vi.mock("../src/lib/segment", () => ({
	initSegment: () => {},
	trackIdentity: () => {},
	trackEvent: (event: string, config: { properties?: Record<string, unknown> } = {}) => {
		events.push({ event, properties: config.properties });
	},
}));

// src/env.ts requires PROD, which the build defines. Vitest sets it to "".
process.env.PROD = "false";

// Imports tracking as a new process would, with its own config directory.
async function loadTracking(
	home: URL,
	config: { token?: string; store?: StoreMode; storeReason?: FallbackReason } = {},
) {
	vi.resetModules();
	vi.stubEnv("PRISMIC_CONFIG_DIR", fileURLToPath(home));
	vi.stubEnv("AI_AGENT", "test-agent");
	// Gives the same runtime on every machine.
	vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
	const tracking = await import("../src/tracking");
	await tracking.initTracking({ host: "wroom.io", ...config });
	return tracking;
}

function getLoginProperties() {
	const { store, storeReason, loginResult, loginResumed, loginDurationS, revoked } =
		events.at(-1)?.properties ?? {};
	return { store, storeReason, loginResult, loginResumed, loginDurationS, revoked };
}

// The tests share the recorded events and the environment.
describe("login details on the End event", { concurrent: false }, () => {
	beforeEach(() => {
		events.length = 0;
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("adds the store, the login and the logout", async ({ expect, home }) => {
		let tracking = await loadTracking(home, {
			store: "file",
			storeReason: "secret-service-missing",
		});
		tracking.trackCommandEnd("repo-list");
		expect(getLoginProperties()).toEqual({
			store: "file",
			storeReason: "secret-service-missing",
		});

		tracking = await loadTracking(home);
		tracking.trackLogin({ result: "wait-limit", resumed: false, startedAt: Date.now() - 90_000 });
		tracking.trackCommandEnd("repo-list");
		expect(getLoginProperties()).toEqual({
			loginResult: "wait-limit",
			loginResumed: false,
			loginDurationS: 90,
		});

		tracking = await loadTracking(home);
		tracking.trackLogin({
			result: "success",
			resumed: true,
			startedAt: Date.now() - 120_000,
			store: "keyring",
		});
		tracking.trackCommandEnd("repo-list");
		expect(getLoginProperties()).toEqual({
			store: "keyring",
			loginResult: "success",
			loginResumed: true,
			loginDurationS: 120,
		});

		tracking = await loadTracking(home, { store: "keyring" });
		tracking.trackLogout({ revoked: false });
		tracking.trackCommandEnd("logout");
		expect(getLoginProperties()).toEqual({ store: "keyring", revoked: false });
	});

	it("leaves Start and End unchanged until something sets them", async ({ expect, home }) => {
		const tracking = await loadTracking(home);
		tracking.trackCommandStart("repo-list");
		tracking.trackCommandEnd("repo-list");

		// Segment receives JSON, which drops undefined properties.
		const sent = events.map(({ event, properties }) => [
			event,
			Object.keys(JSON.parse(JSON.stringify(properties))),
		]);
		const context = ["agent", "auth", "runtime", "runtimeProvider"];
		expect(sent).toEqual([
			["Prismic CLI Start", ["commandType", "fullCommand", ...context]],
			["Prismic CLI End", ["commandType", "fullCommand", "success", ...context]],
		]);
	});

	it("maps device flow errors onto login results", async ({ expect, home }) => {
		const tracking = await loadTracking(home);
		const { DeviceFlowError } = await import("../src/lib/prismic/device-flow");
		const reasons = [
			"expired",
			"declined",
			"email-unverified",
			"invalid-grant",
			"misconfigured",
			"unavailable",
		] as const;

		const results = reasons.map((reason) => [
			reason,
			tracking.getLoginResult(new DeviceFlowError(reason, "prismic.io")),
		]);
		expect(Object.fromEntries(results)).toEqual({
			expired: "expired",
			declined: "declined",
			"email-unverified": "email-unverified",
			"invalid-grant": "error",
			misconfigured: "error",
			unavailable: "error",
		});
	});

	it("never sends tokens, codes or the key", async ({ expect, home }) => {
		const key = randomBytes(32).toString("base64");
		const auth0 = { host: "prismic.io", auth0Domain: "auth0.prismic.io", clientId: "client-id" };
		const pending = {
			...auth0,
			deviceCode: "device-code-secret",
			userCode: "BCDF-GHJK",
			verificationUri: "https://auth0.prismic.io/activate",
			verificationUriComplete: "https://auth0.prismic.io/activate?user_code=BCDF-GHJK",
			expiresAt: Date.now() + 900_000,
			intervalMs: 5_000,
			startedAt: Date.now(),
		};
		const login = {
			store: "keyring",
			key,
			session: {
				...auth0,
				accessToken: "access-token-secret",
				refreshToken: "refresh-token-secret",
				pendingLogin: pending,
			},
		} as const;

		// Callers hold a whole pending login and saved login, not just the fields
		// the End event needs.
		const tracking = await loadTracking(home, { token: "access-token-secret", ...login });
		tracking.trackLogin({ ...pending, ...login, result: "success", resumed: true });
		tracking.trackLogout({ revoked: true });
		tracking.trackCommandStart("login");
		tracking.trackCommandEnd("login");

		expect(events).toHaveLength(2);
		const sent = JSON.stringify(events);
		for (const secret of [
			"access-token-secret",
			"refresh-token-secret",
			"device-code-secret",
			"BCDF-GHJK",
			key,
		]) {
			expect(sent).not.toContain(secret);
		}
	});
});
