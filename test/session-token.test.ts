// Temporary. These unit tests cover the token refresh until commands use it.
// C4, the PR that switches `prismic login` to the device flow, deletes this
// file and tests refresh end to end instead. They use a fake Auth0 tenant,
// since a real login needs a browser approval.

import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, vi, type TestContext } from "vitest";

import type * as Credentials from "../src/credentials";
import { pollDeviceLogin, startDeviceLogin } from "../src/lib/auth0";
import type * as Keyring from "../src/lib/keyring";
import { createFakeAuth0, type FakeAuth0 } from "./auth0";
import { it } from "./it";

const keychain = vi.hoisted(() => ({
	items: new Map<string, string>(),
	fail: {} as Partial<Record<"get" | "set" | "delete", Keyring.KeyringErrorReason>>,
}));

vi.mock("../src/lib/keyring", async (importOriginal) => {
	const actual = await importOriginal<typeof Keyring>();
	const check = (call: keyof typeof keychain.fail) => {
		const reason = keychain.fail[call];
		if (reason) throw new actual.KeyringError(reason);
	};
	const systemKeyring: Keyring.Keyring = {
		async get(service, account) {
			check("get");
			return keychain.items.get(`${service} ${account}`);
		},
		async set(service, account, password) {
			check("set");
			keychain.items.set(`${service} ${account}`, password);
		},
		async delete(service, account) {
			check("delete");
			return keychain.items.delete(`${service} ${account}`);
		},
	};
	return { ...actual, systemKeyring };
});

const INVALID_GRANT = { status: 403, body: { error: "invalid_grant" } };
const PARAMS = { audience: "prismic.io", scope: "openid profile email offline_access" };

// src/env.ts requires PROD, which the build defines. Vitest sets it to "".
process.env.PROD = "false";

// Imports the modules as a new process would, with its own config directory.
async function load(dir: URL) {
	vi.resetModules();
	process.env.PRISMIC_CONFIG_DIR = fileURLToPath(dir);
	return { auth: await import("../src/auth"), store: await import("../src/credentials") };
}

async function startFakeAuth0(onTestFinished: TestContext["onTestFinished"]) {
	const auth0 = await createFakeAuth0({ interval: 0 });
	onTestFinished(() => auth0.close());
	return auth0;
}

async function approveLogin(auth0: FakeAuth0) {
	const { auth0Domain, clientId } = auth0;
	const pending = await startDeviceLogin(PARAMS, { auth0Domain, clientId });
	auth0.approve();
	return pollDeviceLogin(pending);
}

// Saves a login whose access token expires in a minute.
async function logIn(
	auth0: FakeAuth0,
	store: typeof Credentials,
	overrides: Partial<Credentials.Session> = {},
): Promise<Credentials.Session> {
	const session = {
		host: "prismic.io",
		auth0Domain: auth0.auth0Domain,
		clientId: auth0.clientId,
		email: "dev@example.com",
		...(await approveLogin(auth0)),
		expiresAt: Date.now() + 60_000,
		...overrides,
	};
	const lock = await store.lockCredentials({ timeoutMs: 5_000 });
	const choice = await store.prepareLogin(lock);
	await store.writeCredentials(lock, { ...choice, session });
	await lock.release();
	return session;
}

async function readSession(dir: URL) {
	return (await (await load(dir)).store.readCredentials()).login?.session;
}

function refreshRequests(auth0: FakeAuth0) {
	return auth0.requests
		.filter((request) => request.params.grant_type === "refresh_token")
		.map((request) => request.params);
}

// The tests share the keychain and the environment.
describe("getSessionToken", { concurrent: false }, () => {
	beforeEach(() => {
		keychain.items.clear();
		keychain.fail = {};
	});

	it("returns a token with more than 5 minutes left, without the lock or Auth0", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth, store } = await load(home);
		const session = await logIn(auth0, store, { expiresAt: Date.now() + 6 * 60_000 });

		// Another process holds the lock.
		const lock = await store.lockCredentials({ timeoutMs: 5_000 });
		expect(await auth.getSessionToken()).toEqual({ status: "active", token: session.accessToken });
		await lock.release();
		expect(refreshRequests(auth0)).toEqual([]);
	});

	it("refreshes a token about to expire where it was issued, without writing to the keychain", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth, store } = await load(home);
		const session = await logIn(auth0, store);
		const key = [...keychain.items];
		keychain.fail.set = "rejected";

		const startedAt = Date.now();
		const result = await auth.getSessionToken();
		expect(refreshRequests(auth0)).toEqual([
			{
				grant_type: "refresh_token",
				refresh_token: session.refreshToken,
				client_id: auth0.clientId,
			},
		]);
		const saved = await readSession(home);
		expect(result).toEqual({ status: "active", token: saved?.accessToken });
		expect(saved).toEqual({
			...session,
			accessToken: expect.any(String),
			refreshToken: expect.any(String),
			expiresAt: expect.any(Number),
		});
		expect(saved?.accessToken).not.toBe(session.accessToken);
		expect(saved?.refreshToken).not.toBe(session.refreshToken);
		expect(saved?.expiresAt).toBeGreaterThanOrEqual(startedAt + 3_600_000);
		const plain = JSON.parse(await readFile(new URL("credentials.json", home), "utf8"));
		expect(plain.expiresAt).toBe(saved?.expiresAt);
		expect([...keychain.items]).toEqual(key);
	});

	it("keeps the refresh token when Auth0 doesn't send a new one", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth, store } = await load(home);
		const session = await logIn(auth0, store);
		auth0.respondOnce("/oauth/token", {
			status: 200,
			body: { access_token: "new", expires_in: 3_600 },
		});

		expect(await auth.getSessionToken()).toEqual({ status: "active", token: "new" });
		expect((await readSession(home))?.refreshToken).toBe(session.refreshToken);
	});

	it("renews a token that isn't about to expire with forceRefresh, and reports no session", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth, store } = await load(home);
		expect(await auth.getSessionToken()).toEqual({ status: "none" });
		expect(await auth.getSessionToken({ forceRefresh: true })).toEqual({ status: "none" });

		const session = await logIn(auth0, store, { expiresAt: Date.now() + 3_600_000 });
		const result = await auth.getSessionToken({ forceRefresh: true });
		expect(refreshRequests(auth0)).toHaveLength(1);
		expect(result).toEqual({ status: "active", token: (await readSession(home))?.accessToken });
		expect(result).not.toEqual({ status: "active", token: session.accessToken });
	});

	it("ends the session on invalid_grant, and keeps the host, the key and a pending login", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth, store } = await load(home);
		const pendingLogin = {
			auth0Domain: auth0.auth0Domain,
			clientId: auth0.clientId,
			deviceCode: "device-code",
			userCode: "BCDF-GHJK",
			verificationUri: `${auth0.auth0Domain}/activate`,
			expiresAt: Date.now() + 900_000,
			intervalMs: 5_000,
		};
		// The fake tenant doesn't know this refresh token, as after a revoke.
		await logIn(auth0, store, { refreshToken: "revoked", pendingLogin });
		const key = [...keychain.items];

		expect(await auth.getSessionToken()).toEqual({ status: "ended" });
		expect(refreshRequests(auth0)).toHaveLength(1);
		expect(await (await load(home)).store.readCredentials()).toEqual({
			host: "prismic.io",
			login: {
				store: "keyring",
				session: {
					host: "prismic.io",
					auth0Domain: auth0.auth0Domain,
					clientId: auth0.clientId,
					pendingLogin,
				},
			},
		});
		expect([...keychain.items]).toEqual(key);

		expect(await auth.getSessionToken()).toEqual({ status: "none" });
		expect(refreshRequests(auth0)).toHaveLength(1);
	});

	it("retries once with a refresh token that changed during the refresh", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		// A file login, so the test can save a session as another process would.
		keychain.fail.set = "unavailable";
		const { auth, store } = await load(home);
		const session = await logIn(auth0, store);
		const writeSession = (saved: Credentials.Session) =>
			writeFile(
				new URL("credentials.json", home),
				JSON.stringify({
					version: 2,
					store: "file",
					storeReason: "secret-service-missing",
					...saved,
				}),
			);
		const approveNewer = async () => ({
			...session,
			...(await approveLogin(auth0)),
			expiresAt: Date.now() + 60_000,
		});

		// Something else saves a newer session while Auth0 rejects the first try.
		const newer = await approveNewer();
		auth0.respondOnce("/oauth/token", { ...INVALID_GRANT, delayMs: 500 });
		const result = auth.getSessionToken();
		await vi.waitFor(() => expect(refreshRequests(auth0)).toHaveLength(1));
		await writeSession(newer);
		expect(await result).toEqual({
			status: "active",
			token: (await readSession(home))?.accessToken,
		});
		expect(refreshRequests(auth0).map((params) => params.refresh_token)).toEqual([
			session.refreshToken,
			newer.refreshToken,
		]);

		// Only once.
		const newest = await approveNewer();
		auth0.respondOnce("/oauth/token", { ...INVALID_GRANT, delayMs: 500 });
		auth0.respondOnce("/oauth/token", INVALID_GRANT);
		const ended = auth.getSessionToken({ forceRefresh: true });
		await vi.waitFor(() => expect(refreshRequests(auth0)).toHaveLength(3));
		await writeSession(newest);
		expect(await ended).toEqual({ status: "ended" });
		expect(refreshRequests(auth0)).toHaveLength(4);
		expect(await readSession(home)).toEqual({
			host: "prismic.io",
			auth0Domain: auth0.auth0Domain,
			clientId: auth0.clientId,
		});
	});

	it("uses the current token while Auth0 can't refresh it, and never deletes the login", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth, store } = await load(home);
		const session = await logIn(auth0, store);
		const current = { status: "active", token: session.accessToken };
		const secrets = [session.accessToken, session.refreshToken];

		auth0.respondOnce("/oauth/token", { status: 503 });
		expect(await auth.getSessionToken()).toEqual(current);
		auth0.respondOnce("/oauth/token", { status: 401, body: { error: "invalid_client" } });
		expect(await auth.getSessionToken()).toEqual(current);
		// Longer than the 10-second timeout.
		auth0.respondOnce("/oauth/token", { status: 503, delayMs: 11_000 });
		expect(await auth.getSessionToken()).toEqual(current);

		// A server already refused the current token. The 503 echoes a token to
		// check that errors never carry it.
		auth0.respondOnce("/oauth/token", {
			status: 503,
			body: { error: "temporarily_unavailable", error_description: session.refreshToken },
		});
		const forced = await auth.getSessionToken({ forceRefresh: true }).catch((error) => error);
		expect(forced).toMatchObject({ reason: "unavailable", detail: "temporarily_unavailable" });
		expect(forced.cause).toBeUndefined();
		for (const secret of secrets) expect(`${forced.stack} ${forced.message}`).not.toContain(secret);

		auth0.respondOnce("/oauth/token", { status: 401, body: { error: "invalid_client" } });
		await expect(auth.getSessionToken({ forceRefresh: true })).rejects.toMatchObject({
			reason: "misconfigured",
			detail: "invalid_client",
		});

		const expired = new URL("expired/", home);
		const expiredSession = await logIn(auth0, (await load(expired)).store, {
			expiresAt: Date.now() - 1_000,
		});
		const { auth: expiredAuth } = await load(expired);
		await auth0.close();
		await expect(expiredAuth.getSessionToken()).rejects.toMatchObject({
			reason: "unavailable",
			detail: "network error",
		});

		expect(await readSession(home)).toEqual(session);
		expect(await readSession(expired)).toEqual(expiredSession);
		expect(refreshRequests(auth0)).toHaveLength(5);
	});

	it("shares one refresh between parallel calls in one process", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth, store } = await load(home);
		await logIn(auth0, store);

		const results = await Promise.all(Array.from({ length: 10 }, () => auth.getSessionToken()));
		expect(refreshRequests(auth0)).toHaveLength(1);
		expect(results).toEqual(
			Array(10).fill({ status: "active", token: (await readSession(home))?.accessToken }),
		);

		const forced = await Promise.all(
			Array.from({ length: 10 }, () => auth.getSessionToken({ forceRefresh: true })),
		);
		expect(refreshRequests(auth0)).toHaveLength(2);
		expect(forced).toEqual(
			Array(10).fill({ status: "active", token: (await readSession(home))?.accessToken }),
		);
	});

	it("makes one refresh for 10 parallel commands with a token about to expire, and none logs out", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		await logIn(auth0, (await load(home)).store);
		const commands = [];
		for (let i = 0; i < 10; i++) commands.push((await load(home)).auth);

		const results = await Promise.all(commands.map((auth) => auth.getSessionToken()));
		expect(refreshRequests(auth0)).toHaveLength(1);
		expect(results).toEqual(
			Array(10).fill({ status: "active", token: (await readSession(home))?.accessToken }),
		);
	});

	it("drops the write of a stalled refresh that lost the lock", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth: stalled, store } = await load(home);
		await logIn(auth0, store);

		auth0.respondOnce("/oauth/token", {
			status: 200,
			body: { access_token: "stalled", refresh_token: "stalled", expires_in: 3_600 },
			delayMs: 1_000,
		});
		const stalledResult = stalled.getSessionToken().catch((error) => error);
		await vi.waitFor(() => expect(refreshRequests(auth0)).toHaveLength(1));

		// It stalls long enough for another process to take the lock over.
		await rm(new URL("credentials.lock", home), { recursive: true });
		const result = await (await load(home)).auth.getSessionToken();

		expect(await stalledResult).toMatchObject({ reason: "lock-lost" });
		const saved = await readSession(home);
		expect(result).toEqual({ status: "active", token: saved?.accessToken });
		expect(saved?.refreshToken).not.toBe("stalled");
	});

	it("doesn't retry or end the session after losing the lock", async ({ home, onTestFinished }) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth: stalled, store } = await load(home);
		await logIn(auth0, store);

		auth0.respondOnce("/oauth/token", { ...INVALID_GRANT, delayMs: 1_000 });
		const stalledResult = stalled.getSessionToken().catch((error) => error);
		await vi.waitFor(() => expect(refreshRequests(auth0)).toHaveLength(1));

		// Another process takes the lock over, and saves a newer session.
		await rm(new URL("credentials.lock", home), { recursive: true });
		const other = await load(home);
		const newer = await logIn(auth0, other.store);

		expect(await stalledResult).toMatchObject({ reason: "lock-lost" });
		expect(refreshRequests(auth0)).toHaveLength(1);
		expect(await readSession(home)).toEqual(newer);
	});

	it("doesn't restore a session after a logout that started during the refresh", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth: refreshing, store } = await load(home);
		await logIn(auth0, store);

		auth0.respondOnce("/oauth/token", {
			status: 200,
			body: { access_token: "late", refresh_token: "late", expires_in: 3_600 },
			delayMs: 1_000,
		});
		const result = refreshing.getSessionToken().catch((error) => error);
		await vi.waitFor(() => expect(refreshRequests(auth0)).toHaveLength(1));

		// The refresh stalls long enough for the logout to take the lock over.
		await rm(new URL("credentials.lock", home), { recursive: true });
		const logout = await load(home);
		const lock = await logout.store.lockCredentials({ timeoutMs: 5_000 });
		await logout.store.clearCredentials(lock);
		await lock.release();

		expect(await result).toMatchObject({ reason: "lock-lost" });
		expect(await logout.store.readCredentials()).toEqual({ host: "prismic.io" });
		expect(await readdir(home)).not.toContain("credentials.enc");
		expect(keychain.items.size).toBe(0);
	});
});
