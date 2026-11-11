// Temporary. These unit tests cover the login events until commands send them.
// C4, the PR that switches `prismic login` to the device flow, deletes this
// file and tests the events end to end instead.

import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, vi } from "vitest";

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

const CONTEXT = { agent: "test-agent", runtime: "cloud", runtimeProvider: "claude-code" };

// src/env.ts requires PROD, which the build defines. Vitest sets it to "".
process.env.PROD = "false";

// Imports tracking as a new process would, with its own config directory.
async function loadTracking(home: URL) {
	vi.resetModules();
	vi.stubEnv("PRISMIC_CONFIG_DIR", fileURLToPath(home));
	vi.stubEnv("AI_AGENT", "test-agent");
	// Gives the same runtime on every machine.
	vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
	const tracking = await import("../src/tracking");
	await tracking.initTracking({ host: "wroom.io" });
	return tracking;
}

// The tests share the recorded events and the environment.
describe("login events", { concurrent: false }, () => {
	beforeEach(() => {
		events.length = 0;
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("sends one attempt ID and a growing duration across runs", async ({ expect, home }) => {
		const tracking = await loadTracking(home);
		vi.useFakeTimers({ toFake: ["Date"] });
		const attempt = { attemptId: randomUUID(), startedAt: Date.now() };
		const store = { store: "file", storeReason: "wsl" } as const;

		tracking.trackLoginStart(attempt, { trigger: "init" });
		vi.advanceTimersByTime(90_000);
		tracking.trackLoginEnd(attempt, { trigger: "init", result: "wait-limit", ...store });
		vi.advanceTimersByTime(30_000);
		tracking.trackLoginStart(attempt, { trigger: "login", resume: true });
		tracking.trackLoginEnd(attempt, { trigger: "login", result: "success", ...store });

		const { attemptId } = attempt;
		expect(events).toEqual([
			{
				event: "Prismic CLI Login",
				properties: { phase: "start", attemptId, trigger: "init", ...CONTEXT },
			},
			{
				event: "Prismic CLI Login",
				properties: {
					phase: "end",
					attemptId,
					trigger: "init",
					result: "wait-limit",
					durationS: 90,
					...store,
					...CONTEXT,
				},
			},
			{
				event: "Prismic CLI Login",
				properties: { phase: "resume", attemptId, trigger: "login", ...CONTEXT },
			},
			{
				event: "Prismic CLI Login",
				properties: {
					phase: "end",
					attemptId,
					trigger: "login",
					result: "success",
					durationS: 120,
					...store,
					...CONTEXT,
				},
			},
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

	it("sends session ends, and store errors only for the key or decryption", async ({
		expect,
		home,
	}) => {
		const tracking = await loadTracking(home);
		const { CredentialsError } = await import("../src/credentials");
		const reasons = [
			"invalid-setting",
			"unsupported-version",
			"unsafe-file",
			"lock-lost",
			"locked",
			"timeout",
			"keychain-unavailable",
			"missing-key",
			"decrypt-failed",
		] as const;

		tracking.trackSessionEnded({ reason: "logout", revoked: false });
		tracking.trackSessionEnded({ reason: "invalid-grant", revoked: false });
		for (const reason of reasons) tracking.trackStoreError(new CredentialsError(reason, ""));

		expect(events).toEqual([
			{
				event: "Prismic CLI Session Ended",
				properties: { reason: "logout", revoked: false, ...CONTEXT },
			},
			{
				event: "Prismic CLI Session Ended",
				properties: { reason: "invalid-grant", revoked: false, ...CONTEXT },
			},
			...["locked", "timeout", "missing-key", "decrypt-failed"].map((reason) => ({
				event: "Prismic CLI Store Error",
				properties: { reason, ...CONTEXT },
			})),
		]);
	});

	it("never sends tokens, codes or the key", async ({ expect, home }) => {
		const tracking = await loadTracking(home);
		const { CredentialsError } = await import("../src/credentials");
		const { DeviceFlowError } = await import("../src/lib/prismic/device-flow");
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
			attemptId: randomUUID(),
			startedAt: Date.now(),
		};
		const login = {
			store: "keyring",
			session: {
				...auth0,
				accessToken: "access-token-secret",
				refreshToken: "refresh-token-secret",
				pendingLogin: pending,
			},
		} as const;

		// Callers hold a whole pending login and saved login, not just the fields
		// the events need.
		tracking.trackLoginStart(pending, { trigger: "login" });
		tracking.trackLoginStart(pending, { trigger: "login", resume: true });
		tracking.trackLoginEnd(pending, { trigger: "login", result: "success", ...login });
		tracking.trackLoginEnd(pending, {
			trigger: "login",
			result: tracking.getLoginResult(new DeviceFlowError("misconfigured", "prismic.io")),
		});
		tracking.trackStoreError(new CredentialsError("locked", key, { cause: new Error(key) }));
		tracking.trackSessionEnded({ reason: "logout", revoked: true });

		expect(events).toHaveLength(6);
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
