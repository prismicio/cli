// Temporary. These unit tests cover logout and re-login revocation until
// `prismic login` and `prismic logout` use them. C4, the PR that switches them
// to the device flow, deletes this file and tests both end to end instead.
// They use a fake Auth0 tenant, since a real login needs a browser approval.

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

// src/env.ts requires PROD, which the build defines. Vitest sets it to "".
process.env.PROD = "false";

// Imports the modules as a new process would, with its own config directory.
async function load(dir: URL, env: Record<string, string> = {}) {
	vi.resetModules();
	Object.assign(process.env, {
		PRISMIC_CONFIG_DIR: fileURLToPath(dir),
		PRISMIC_TOKEN: "",
		...env,
	});
	return { auth: await import("../src/auth"), store: await import("../src/credentials") };
}

async function startFakeAuth0(onTestFinished: TestContext["onTestFinished"]) {
	const auth0 = await createFakeAuth0({ interval: 0 });
	onTestFinished(() => auth0.close());
	return auth0;
}

async function logIn(auth0: FakeAuth0): Promise<Credentials.Session> {
	const { auth0Domain, clientId } = auth0;
	const pending = await startDeviceLogin(
		{ audience: "prismic.io", scope: "openid profile email offline_access" },
		{ auth0Domain, clientId },
	);
	auth0.approve();
	const tokens = await pollDeviceLogin(pending);
	return { host: "prismic.io", auth0Domain, clientId, email: "dev@example.com", ...tokens };
}

async function save(store: typeof Credentials, session: Credentials.Session) {
	const lock = await store.lockCredentials({ timeoutMs: 5_000 });
	const choice = await store.prepareLogin(lock);
	await store.writeCredentials(lock, { ...choice, session });
	await lock.release();
}

function revokeRequests(auth0: FakeAuth0) {
	return auth0.requests
		.filter((request) => request.path === "/oauth/revoke")
		.map((request) => request.params);
}

// The tests share the keychain and the environment.
describe("sessions", { concurrent: false }, () => {
	beforeEach(() => {
		keychain.items.clear();
		keychain.fail = {};
	});

	it("logout revokes the session where it was issued, and keeps the host", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth, store } = await load(home);
		const session = await logIn(auth0);
		await save(store, session);
		await writeFile(
			new URL("analytics.json", home),
			JSON.stringify({ anonymousId: "anonymous", userId: "user" }),
		);

		expect(await auth.endSession()).toEqual({ revoked: true, warnings: [] });
		expect(revokeRequests(auth0)).toEqual([
			{ client_id: auth0.clientId, token: session.refreshToken },
		]);
		expect(await store.readCredentials()).toEqual({ host: "prismic.io" });
		expect(await readdir(home)).not.toContain("credentials.enc");
		expect(keychain.items.size).toBe(0);
		expect(JSON.parse(await readFile(new URL("analytics.json", home), "utf8"))).toEqual({
			anonymousId: "anonymous",
		});
	});

	it("logout deletes the login when the revoke fails, and says why", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const cases = [
			["unavailable", { status: 503 }, "the login service answered HTTP 503"],
			["offline", undefined, "the login service can't be reached"],
		] as const;
		for (const [name, response, problem] of cases) {
			const dir = new URL(`${name}/`, home);
			const { auth, store } = await load(dir);
			await save(store, await logIn(auth0));
			if (response) auth0.respondOnce("/oauth/revoke", response);
			else await auth0.close();

			expect(await auth.endSession()).toEqual({
				revoked: false,
				warnings: [
					`Couldn't revoke your session because ${problem}. It stays valid until it expires.`,
				],
			});
			expect(await store.readCredentials()).toEqual({ host: "prismic.io" });
			expect(await readdir(dir)).not.toContain("credentials.enc");
			expect(keychain.items.size).toBe(0);
		}
	});

	it("logout deletes the login when the key can't be read, and says why", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const cases = [
			[
				"missing",
				() => keychain.items.clear(),
				[
					"Couldn't revoke your session because the saved login can't be read. It stays valid until it expires.",
				],
			],
			[
				"locked",
				() => (keychain.fail = { get: "locked", delete: "locked" }),
				[
					"Couldn't revoke your session because the keychain is locked. It stays valid until it expires.",
					"Couldn't delete your Prismic key because the keychain is locked.",
				],
			],
		] as const;
		for (const [name, breakKey, warnings] of cases) {
			const dir = new URL(`${name}/`, home);
			await save((await load(dir)).store, await logIn(auth0));
			breakKey();
			const { auth, store } = await load(dir);

			expect(await auth.endSession()).toEqual({ revoked: false, warnings });
			expect(await readdir(dir)).not.toContain("credentials.enc");
			keychain.fail = {};
			expect(await store.readCredentials()).toEqual({ host: "prismic.io" });
		}
		expect(revokeRequests(auth0)).toEqual([]);
	});

	it("logout clears the saved login when PRISMIC_TOKEN is set, and says so", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth, store } = await load(home, { PRISMIC_TOKEN: "write-api-token" });
		const session = await logIn(auth0);
		await save(store, session);

		const warnings = ["PRISMIC_TOKEN is still set, so commands still use it."];
		expect(await auth.endSession()).toEqual({ revoked: true, warnings });
		expect(revokeRequests(auth0)).toEqual([
			{ client_id: auth0.clientId, token: session.refreshToken },
		]);
		expect(await store.readCredentials()).toEqual({ host: "prismic.io" });

		// Nothing is saved anymore, only PRISMIC_TOKEN is left.
		expect(await auth.endSession()).toEqual({ revoked: false, warnings });
		expect(revokeRequests(auth0)).toHaveLength(1);
	});

	it("a new login revokes the previous session after saving", async ({ home, onTestFinished }) => {
		const previousAuth0 = await startFakeAuth0(onTestFinished);
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth, store } = await load(home);
		const previous = await logIn(previousAuth0);
		await save(store, previous);
		const next = await logIn(auth0);

		const lock = await store.lockCredentials({ timeoutMs: 5_000 });
		expect(await auth.replaceSession(lock, { store: "keyring", session: next })).toEqual({});
		await lock.release();

		expect(revokeRequests(previousAuth0)).toEqual([
			{ client_id: previousAuth0.clientId, token: previous.refreshToken },
		]);
		expect(revokeRequests(auth0)).toEqual([]);
		expect((await store.readCredentials()).login?.session).toEqual(next);
	});

	it("a new login is saved when the revoke fails, and nothing is revoked when the save fails", async ({
		home,
		onTestFinished,
	}) => {
		const auth0 = await startFakeAuth0(onTestFinished);
		const { auth, store } = await load(home);
		const previous = await logIn(auth0);
		await save(store, previous);

		// Another process took the lock over.
		const stalled = await store.lockCredentials({ timeoutMs: 5_000 });
		await rm(new URL("credentials.lock", home), { recursive: true });
		await expect(
			auth.replaceSession(stalled, { store: "keyring", session: await logIn(auth0) }),
		).rejects.toMatchObject({ reason: "lock-lost" });
		expect(revokeRequests(auth0)).toEqual([]);
		expect((await store.readCredentials()).login?.session).toEqual(previous);
		await stalled.release();

		const next = await logIn(auth0);
		auth0.respondOnce("/oauth/revoke", { status: 503 });
		const lock = await store.lockCredentials({ timeoutMs: 5_000 });
		await auth.replaceSession(lock, { store: "keyring", session: next });
		await lock.release();
		expect(revokeRequests(auth0)).toEqual([
			{ client_id: auth0.clientId, token: previous.refreshToken },
		]);
		expect((await store.readCredentials()).login?.session).toEqual(next);
	});
});
