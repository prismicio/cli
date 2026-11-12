// Temporary. C4, the PR that switches `prismic login` to the device flow,
// deletes this file and tests login end to end instead.

import { describe, type TestContext } from "vitest";

import {
	DeviceFlowError,
	getDeviceLoginPrompt,
	pollDeviceLogin,
	startDeviceLogin,
} from "../src/lib/auth0";
import { createFakeAuth0, type FakeAuth0, type FakeAuth0Options } from "./auth0";
import { it } from "./it";

const PARAMS = { audience: "prismic.io", scope: "openid profile email offline_access" };

describe("startDeviceLogin", () => {
	it("requests a code for the given audience and scope", async ({ expect, onTestFinished }) => {
		const { auth0, start } = await setup(onTestFinished, { interval: 7 });
		const startedAt = Date.now();
		const pending = await start();
		expect(auth0.requests[0].params).toEqual({ client_id: auth0.clientId, ...PARAMS });
		expect(pending).toMatchObject({
			auth0Domain: auth0.auth0Domain,
			clientId: auth0.clientId,
			verificationUri: `${auth0.auth0Domain}/activate`,
			intervalMs: 7_000,
		});
		expect(pending.expiresAt).toBeGreaterThanOrEqual(startedAt + 900_000);
		expect(getDeviceLoginPrompt(pending)).toEqual({
			url: `${auth0.auth0Domain}/activate?user_code=${pending.userCode}`,
			userCode: pending.userCode,
			codeInUrl: true,
		});
	});

	it("handles a response without a complete URL or interval", async ({
		expect,
		onTestFinished,
	}) => {
		const { auth0, start } = await setup(onTestFinished);
		auth0.respondOnce("/oauth/device/code", {
			status: 200,
			body: {
				device_code: "device-code",
				user_code: "BCDF-GHJK",
				verification_uri: "https://auth0.prismic.io/activate",
				expires_in: 900,
			},
		});
		const pending = await start();
		expect(pending.intervalMs).toBe(5_000);
		expect(getDeviceLoginPrompt(pending)).toEqual({
			url: "https://auth0.prismic.io/activate",
			userCode: "BCDF-GHJK",
			codeInUrl: false,
		});
	});

	it("reports a client that isn't set up", async ({ expect, onTestFinished }) => {
		const { auth0 } = await setup(onTestFinished);
		const error = await startDeviceLogin(PARAMS, {
			auth0Domain: auth0.auth0Domain,
			clientId: "unknown",
		}).catch((error) => error);
		expect(error).toBeInstanceOf(DeviceFlowError);
		expect(error).toMatchObject({ reason: "misconfigured", detail: "invalid_client" });
	});

	it("reports an unreachable login service", async ({ expect, onTestFinished }) => {
		const { auth0, start } = await setup(onTestFinished);
		auth0.respondOnce("/oauth/device/code", { status: 503 });
		await expect(start()).rejects.toMatchObject({ reason: "unavailable", detail: "HTTP 503" });
	});
});

describe("pollDeviceLogin", () => {
	it("returns the tokens once approved", async ({ expect, onTestFinished }) => {
		const { auth0, start } = await setup(onTestFinished, { accessToken: "access", expiresIn: 60 });
		const pending = await start();
		auth0.respondOnce("/oauth/token", { status: 403, body: { error: "authorization_pending" } });
		auth0.respondOnce("/oauth/token", { status: 403, body: { error: "authorization_pending" } });
		auth0.approve();
		const tokens = await pollDeviceLogin(pending);
		expect(tokenRequests(auth0)).toHaveLength(3);
		expect(tokenRequests(auth0)[0].params).toEqual({
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			device_code: pending.deviceCode,
			client_id: auth0.clientId,
		});
		expect(tokens.accessToken).toBe("access");
		expect(tokens.refreshToken).toEqual(expect.any(String));
		expect(tokens.expiresAt).toBeGreaterThan(Date.now() + 55_000);
		expect(tokens.expiresAt).toBeLessThanOrEqual(Date.now() + 60_000);
	});

	it("completes a resumed login that was already approved", async ({ expect, onTestFinished }) => {
		const { auth0, start } = await setup(onTestFinished, { interval: 5 });
		const pending = await start();
		auth0.approve();
		const tokens = await pollDeviceLogin({ ...pending, expiresAt: Date.now() + 2_000 });
		expect(tokens.accessToken).toEqual(expect.any(String));
	});

	it("adds 5 seconds to the interval on slow_down", async ({ expect, onTestFinished }) => {
		const { auth0, start } = await setup(onTestFinished);
		const pending = await start();
		auth0.respondOnce("/oauth/token", {
			status: 429,
			body: { error: "slow_down", error_description: "Slow down." },
		});
		auth0.approve();
		const updates: number[] = [];
		const startedAt = performance.now();
		await pollDeviceLogin(pending, {
			onUpdate: (pending) => void updates.push(pending.intervalMs),
		});
		expect(updates).toEqual([5_000]);
		expect(performance.now() - startedAt).toBeGreaterThanOrEqual(5_000);
	});

	it("waits for Retry-After", async ({ expect, onTestFinished }) => {
		const { auth0, start } = await setup(onTestFinished);
		const pending = await start();
		auth0.respondOnce("/oauth/token", { status: 429, headers: { "Retry-After": "3" } });
		auth0.approve();
		const startedAt = performance.now();
		await pollDeviceLogin(pending);
		expect(tokenRequests(auth0)).toHaveLength(2);
		expect(performance.now() - startedAt).toBeGreaterThanOrEqual(3_000);
	});

	it("backs off after server errors", async ({ expect, onTestFinished }) => {
		const { auth0, start } = await setup(onTestFinished);
		const pending = await start();
		auth0.respondOnce("/oauth/token", { status: 503, headers: { "Retry-After": "0" } });
		auth0.respondOnce("/oauth/token", { status: 500, body: { error: "server_error" } });
		auth0.approve();
		const startedAt = performance.now();
		await pollDeviceLogin(pending);
		expect(tokenRequests(auth0)).toHaveLength(3);
		// 2 seconds, then 4.
		expect(performance.now() - startedAt).toBeGreaterThanOrEqual(6_000);
	});

	it("retries after a request times out", async ({ expect, onTestFinished }) => {
		const { auth0, start } = await setup(onTestFinished);
		const pending = await start();
		auth0.respondOnce("/oauth/token", { status: 200, delayMs: 11_000 });
		auth0.approve();
		const startedAt = performance.now();
		const tokens = await pollDeviceLogin(pending);
		expect(tokens.accessToken).toEqual(expect.any(String));
		expect(performance.now() - startedAt).toBeGreaterThanOrEqual(10_000);
	});

	it("stops when the code expires", async ({ expect, onTestFinished }) => {
		const { auth0, start } = await setup(onTestFinished);
		const pending = await start();
		auth0.expire();
		await expect(pollDeviceLogin(pending)).rejects.toMatchObject({
			reason: "expired",
			detail: "expired_token",
		});
		await expect(pollDeviceLogin({ ...pending, expiresAt: Date.now() })).rejects.toMatchObject({
			reason: "expired",
		});
		expect(tokenRequests(auth0)).toHaveLength(1);
	});

	it("reports a declined login", async ({ expect, onTestFinished }) => {
		const { auth0, start } = await setup(onTestFinished);
		const declined = await start();
		auth0.deny({ userCode: declined.userCode });
		await expect(pollDeviceLogin(declined)).rejects.toMatchObject({ reason: "declined" });
		const unverified = await start();
		auth0.deny({ userCode: unverified.userCode, description: "email_verification_failed" });
		await expect(pollDeviceLogin(unverified)).rejects.toMatchObject({
			reason: "email-unverified",
		});
	});

	it("rejects a code that was already used", async ({ expect, onTestFinished }) => {
		const { auth0, start } = await setup(onTestFinished);
		const pending = await start();
		auth0.approve();
		await pollDeviceLogin(pending);
		await expect(pollDeviceLogin(pending)).rejects.toMatchObject({ reason: "invalid-grant" });
	});

	it("stops on unknown errors without exposing the code", async ({ expect, onTestFinished }) => {
		const { auth0, start } = await setup(onTestFinished);
		const pending = await start();
		auth0.respondOnce("/oauth/token", {
			status: 403,
			body: { error: "unauthorized_client", error_description: pending.deviceCode },
		});
		const error = await pollDeviceLogin(pending).catch((error) => error);
		expect(error).toMatchObject({ reason: "misconfigured", detail: "unauthorized_client" });
		expect(error.message).not.toContain(pending.deviceCode);
		expect(error.cause).toBeUndefined();
		auth0.respondOnce("/oauth/token", { status: 404, body: pending.deviceCode });
		await expect(pollDeviceLogin(pending)).rejects.toMatchObject({ detail: "HTTP 404" });
		auth0.respondOnce("/oauth/token", { status: 200, body: { access_token: "a", expires_in: 60 } });
		await expect(pollDeviceLogin(pending)).rejects.toMatchObject({
			detail: "unexpected response",
		});
	});

	it("stops when aborted", async ({ expect, onTestFinished }) => {
		const { start } = await setup(onTestFinished, { interval: 1 });
		const pending = await start();
		await expect(
			pollDeviceLogin(pending, { signal: AbortSignal.timeout(1_500) }),
		).rejects.toMatchObject({ name: "TimeoutError" });
	});
});

async function setup(onTestFinished: TestContext["onTestFinished"], options?: FakeAuth0Options) {
	const auth0 = await createFakeAuth0({ interval: 0, ...options });
	onTestFinished(() => auth0.close());
	const start = () =>
		startDeviceLogin(PARAMS, { auth0Domain: auth0.auth0Domain, clientId: auth0.clientId });
	return { auth0, start };
}

function tokenRequests(auth0: FakeAuth0) {
	return auth0.requests.filter((request) => request.path === "/oauth/token");
}
