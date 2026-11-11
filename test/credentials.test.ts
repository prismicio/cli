// Temporary. These unit tests cover the credential store until `prismic login`
// uses it. C4, the PR that switches `prismic login` to the device flow, deletes
// this file and tests login end to end instead.

import { randomBytes, randomUUID } from "node:crypto";
import { chown, mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";

import { describe, expect } from "vitest";

import {
	KeyringError,
	systemKeyring,
	type Keyring,
	type KeyringErrorReason,
} from "../src/lib/keyring";
import { it } from "./it";

// src/env.ts requires PROD, which the build defines. Vitest sets it to "".
process.env.PROD = "false";
const { createCredentialStore } = await import("../src/credentials");

const isWindows = process.platform === "win32";

const session = {
	host: "prismic.io",
	domain: "auth0.prismic.io",
	clientId: "client-id",
	email: "dev@example.com",
	accessToken: "access-token-secret",
	refreshToken: "refresh-token-secret",
	expiresAt: 1_800_000_000_000,
};

const DECRYPT_ERROR = "Your Prismic login can't be decrypted. Run `prismic login` again.";
const LOCKED_ERROR =
	"Can't read your Prismic key because the keychain is locked in this session. Unlock it and try again, or log in again with PRISMIC_CREDENTIALS_STORE=file.";

// An in-memory keychain. Set `fail.get`, `fail.set` or `fail.delete` to make
// that call throw.
function fakeKeyring() {
	const items = new Map<string, string>();
	const fail: Partial<Record<"get" | "set" | "delete", KeyringErrorReason>> = {};
	const check = (call: keyof typeof fail) => {
		const reason = fail[call];
		if (reason) throw new KeyringError(reason);
	};
	const keyring: Keyring = {
		async get(service, account) {
			check("get");
			return items.get(`${service} ${account}`);
		},
		async set(service, account, password) {
			check("set");
			items.set(`${service} ${account}`, password);
		},
		async delete(service, account) {
			check("delete");
			return items.delete(`${service} ${account}`);
		},
	};
	return { keyring, items, fail };
}

async function logIn(store: ReturnType<typeof createCredentialStore>, saved = session) {
	const choice = await store.prepareLogin();
	const lock = await store.lock({ timeoutMs: 5_000 });
	await store.write(lock, { store: choice.store, session: saved });
	await lock.release();
	return choice;
}

describe("encryption", () => {
	it("round trips a keyring login, with a fresh nonce on every write", async ({ home }) => {
		const dir = new URL("config/", home);
		const { keyring } = fakeKeyring();
		const store = createCredentialStore({ dir, keyring, setting: "auto" });
		// A new login waiting for approval, next to the current tokens.
		const saved = {
			...session,
			pendingLogin: {
				host: session.host,
				domain: session.domain,
				clientId: session.clientId,
				deviceCode: "device-code-secret",
				userCode: "BCDF-GHJK",
				verificationUri: "https://auth0.prismic.io/activate",
				expiresAt: 1_800_000_900_000,
				interval: 5,
			},
		};

		expect(await logIn(store, saved)).toEqual({ store: "keyring" });
		const first = await readFile(new URL("credentials.enc", dir));
		await logIn(store, saved);
		const second = await readFile(new URL("credentials.enc", dir));

		// Format byte, then the 12-byte nonce.
		expect(first.subarray(1, 13).equals(second.subarray(1, 13))).toBe(false);
		expect(first.toString("latin1")).not.toContain(session.refreshToken);
		expect(first.toString("latin1")).not.toContain("device-code-secret");
		expect(JSON.parse(await readFile(new URL("credentials.json", dir), "utf8"))).toEqual({
			version: 2,
			host: session.host,
			email: session.email,
			expiresAt: session.expiresAt,
			store: "keyring",
			domain: session.domain,
			clientId: session.clientId,
		});

		const reader = createCredentialStore({ dir, keyring });
		expect(await reader.read()).toEqual({
			host: session.host,
			login: { store: "keyring", session: saved },
		});
	});

	it("rejects a tampered file, a wrong key and a missing key", async ({ home }) => {
		const dir = new URL("config/", home);
		const encPath = new URL("credentials.enc", dir);
		const { keyring, items } = fakeKeyring();
		await logIn(createCredentialStore({ dir, keyring }));
		const original = await readFile(encPath);
		const [[name, key]] = items;

		const tampered = Buffer.from(original);
		tampered[tampered.length - 1] ^= 1;
		await writeFile(encPath, tampered);
		await expect(createCredentialStore({ dir, keyring }).read()).rejects.toMatchObject({
			reason: "decrypt-failed",
			message: DECRYPT_ERROR,
		});

		await writeFile(encPath, original);
		items.set(name, randomBytes(32).toString("base64"));
		await expect(createCredentialStore({ dir, keyring }).read()).rejects.toMatchObject({
			reason: "decrypt-failed",
			message: DECRYPT_ERROR,
		});

		items.clear();
		await expect(createCredentialStore({ dir, keyring }).read()).rejects.toMatchObject({
			reason: "missing-key",
			message: DECRYPT_ERROR,
		});

		items.set(name, key);
		expect((await createCredentialStore({ dir, keyring }).read()).login?.session).toEqual(session);
	});
});

describe("modes", () => {
	it("auto falls back to a plaintext file when the keychain fails at login", async ({ home }) => {
		const cases = [
			["module-missing", "module-missing"],
			["unavailable", "secret-service-missing"],
			["locked", "locked"],
			["rejected", "write-rejected"],
			["timeout", "timeout"],
		] as const;
		for (const [keyringReason, reason] of cases) {
			const dir = new URL(`${reason}/`, home);
			const { keyring, fail } = fakeKeyring();
			fail.set = keyringReason;
			const store = createCredentialStore({ dir, keyring, setting: "auto" });

			const choice = await logIn(store);
			expect(choice).toMatchObject({ store: "file", reason });
			expect(choice).toHaveProperty(
				"warning",
				expect.stringMatching(
					/^No usable keychain \(.+\)\. Saved your login in .+credentials\.json, readable only by you\.$/,
				),
			);
			expect(await store.read()).toEqual({
				host: session.host,
				login: { store: "file", session },
			});
		}
	});

	it("keyring mode fails instead of falling back", async ({ home }) => {
		const { keyring, fail } = fakeKeyring();
		fail.set = "locked";
		const store = createCredentialStore({ dir: home, keyring, setting: "keyring" });
		await expect(store.prepareLogin()).rejects.toMatchObject({
			reason: "keychain-unavailable",
			message: expect.stringContaining("no usable keychain (the keychain is locked)"),
		});
	});

	it("file mode keeps everything in credentials.json and never touches the keychain", async ({
		home,
	}) => {
		const dir = new URL("config/", home);
		const { keyring, fail } = fakeKeyring();
		Object.assign(fail, { get: "rejected", set: "rejected", delete: "rejected" });
		const store = createCredentialStore({ dir, keyring, setting: "file" });

		expect(await logIn(store)).toEqual({ store: "file", reason: "forced" });
		expect(JSON.parse(await readFile(new URL("credentials.json", dir), "utf8"))).toEqual({
			version: 2,
			store: "file",
			...session,
		});
		expect(await readdir(dir)).not.toContain("credentials.enc");
		expect(await store.read()).toEqual({ host: session.host, login: { store: "file", session } });
	});

	it("never switches modes after login, and a failed key read isn't a logout", async ({ home }) => {
		const { keyring, fail } = fakeKeyring();
		await logIn(createCredentialStore({ dir: home, keyring, setting: "auto" }));

		// The setting only matters at login.
		fail.get = "locked";
		const store = createCredentialStore({ dir: home, keyring, setting: "file" });
		await expect(store.read()).rejects.toMatchObject({ reason: "locked", message: LOCKED_ERROR });

		fail.get = "timeout";
		await expect(store.read()).rejects.toMatchObject({ reason: "timeout" });
	});

	it("rejects an unknown setting", async ({ home }) => {
		const store = createCredentialStore({ dir: home, setting: "keychain" });
		await expect(store.prepareLogin()).rejects.toMatchObject({ reason: "invalid-setting" });
	});

	it("reuses one key per config directory", async ({ home }) => {
		const { keyring, items } = fakeKeyring();
		await logIn(createCredentialStore({ dir: new URL("a/", home), keyring }));
		const [[account, key]] = items;
		await logIn(createCredentialStore({ dir: new URL("a/", home), keyring }));
		expect([...items]).toEqual([[account, key]]);
		expect(account).toMatch(/^prismic-cli cli:[0-9a-f]{16}$/);

		await logIn(createCredentialStore({ dir: new URL("b/", home), keyring }));
		expect(items.size).toBe(2);
	});

	it("creates a new key at login when another process deleted it", async ({ home }) => {
		const { keyring, items } = fakeKeyring();
		const store = createCredentialStore({ dir: home, keyring });
		await logIn(store);
		await store.read();

		items.clear();
		await logIn(store);
		expect(items.size).toBe(1);
		expect((await createCredentialStore({ dir: home, keyring }).read()).login?.session).toEqual(
			session,
		);
	});
});

describe("files", () => {
	it.skipIf(isWindows)(
		"writes a private directory and private files through temporary files",
		async ({ home }) => {
			const dir = new URL("config/", home);
			await mkdir(dir, { mode: 0o755 });
			await logIn(createCredentialStore({ dir, keyring: fakeKeyring().keyring }));

			expect((await stat(dir)).mode & 0o777).toBe(0o700);
			expect((await stat(new URL("credentials.json", dir))).mode & 0o777).toBe(0o600);
			expect((await stat(new URL("credentials.enc", dir))).mode & 0o777).toBe(0o600);
			// No temporary files or lock left behind.
			expect((await readdir(dir)).sort()).toEqual(["credentials.enc", "credentials.json"]);
		},
	);

	it.skipIf(isWindows)("refuses symlinked credential files", async ({ home }) => {
		const dir = new URL("config/", home);
		const { keyring } = fakeKeyring();
		await logIn(createCredentialStore({ dir, keyring }));
		const elsewhere = new URL("elsewhere/", home);
		await mkdir(elsewhere);

		for (const name of ["credentials.enc", "credentials.json"]) {
			const path = new URL(name, dir);
			await writeFile(new URL(name, elsewhere), await readFile(path));
			await rm(path);
			await symlink(new URL(name, elsewhere), path);

			await expect(createCredentialStore({ dir, keyring }).read()).rejects.toMatchObject({
				reason: "unsafe-file",
				message: expect.stringContaining("because it's a symbolic link"),
			});
			await rm(path);
			await writeFile(path, await readFile(new URL(name, elsewhere)), { mode: 0o600 });
		}
	});

	// Changing a file's owner needs root, so this runs only as root.
	it.skipIf(process.getuid?.() !== 0)(
		"refuses files that belong to another user",
		async ({ home }) => {
			await writeFile(new URL("credentials.json", home), JSON.stringify({ token: "t", host: "h" }));
			await chown(new URL("credentials.json", home), 65534, 65534);
			await expect(createCredentialStore({ dir: home }).read()).rejects.toMatchObject({
				reason: "unsafe-file",
				message: expect.stringContaining("because it belongs to another user"),
			});
		},
	);

	it("reads older files", async ({ home }) => {
		const read = async (name: string, contents: string | undefined) => {
			const dir = new URL(`${name}/`, home);
			await mkdir(dir);
			if (contents !== undefined) {
				await writeFile(new URL("credentials.json", dir), contents, { mode: 0o644 });
			}
			return createCredentialStore({ dir, keyring: fakeKeyring().keyring }).read();
		};

		expect(await read("nothing", undefined)).toEqual({});
		expect(await read("host-only", JSON.stringify({ host: "wroom.io" }))).toEqual({
			host: "wroom.io",
		});
		expect(await read("version-1", JSON.stringify({ token: "token", host: "wroom.io" }))).toEqual({
			host: "wroom.io",
			legacyToken: "token",
		});
		if (!isWindows) {
			const mode = (await stat(new URL("version-1/credentials.json", home))).mode & 0o777;
			expect(mode).toBe(0o600);
		}
		expect(await read("invalid", "{")).toEqual({});
		await expect(
			read("damaged", JSON.stringify({ version: 2, store: "file", host: null })),
		).rejects.toMatchObject({ reason: "decrypt-failed" });
		await expect(read("newer", JSON.stringify({ version: 3 }))).rejects.toMatchObject({
			reason: "unsupported-version",
		});
	});
});

describe("lock and logout", () => {
	it("drops writes from a process that lost the lock", async ({ home }) => {
		const { keyring } = fakeKeyring();
		const store = createCredentialStore({ dir: home, keyring, setting: "file" });
		const stalled = await store.lock({ timeoutMs: 5_000 });

		// Another process took the lock over.
		await rm(new URL("credentials.lock", home), { recursive: true });
		const current = await store.lock({ timeoutMs: 5_000 });
		await store.write(current, { store: "file", session });

		await expect(
			store.write(stalled, { store: "file", session: { ...session, accessToken: "old" } }),
		).rejects.toMatchObject({ reason: "lock-lost" });
		await expect(store.clear(stalled)).rejects.toMatchObject({ reason: "lock-lost" });
		expect((await store.read()).login?.session).toEqual(session);
		await current.release();
	});

	it("logout deletes the session and the key, and keeps the host", async ({ home }) => {
		const { keyring, items, fail } = fakeKeyring();
		const store = createCredentialStore({ dir: home, keyring });
		await logIn(store);

		const lock = await store.lock({ timeoutMs: 5_000 });
		await store.clear(lock);
		await lock.release();
		expect(await store.read()).toEqual({ host: session.host });
		expect(await readdir(home)).not.toContain("credentials.enc");
		expect(items.size).toBe(0);

		// A locked keychain still loses the files, and says the key stayed.
		await logIn(store);
		fail.delete = "locked";
		const again = await store.lock({ timeoutMs: 5_000 });
		await expect(store.clear(again)).rejects.toMatchObject({
			reason: "locked",
			message: expect.stringContaining("Can't delete your Prismic key"),
		});
		await again.release();
		expect(await store.read()).toEqual({ host: session.host });
	});
});

it("round trips a key through the system keychain", async () => {
	const service = "prismic-cli-test";
	const account = `test:${randomUUID()}`;
	const options = { timeoutMs: 10_000 };
	try {
		await systemKeyring.set(service, account, "key", options);
	} catch (error) {
		// Linux CI has no Secret Service.
		expect(process.platform).toBe("linux");
		expect(error).toMatchObject({ reason: "unavailable" });
		return;
	}
	try {
		expect(await systemKeyring.get(service, account, options)).toBe("key");
	} finally {
		expect(await systemKeyring.delete(service, account, options)).toBe(true);
	}
	expect(await systemKeyring.get(service, account, options)).toBeUndefined();
	expect(await systemKeyring.delete(service, account, options)).toBe(false);
});
