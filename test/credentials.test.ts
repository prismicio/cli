// Temporary. These unit tests cover the credential store until `prismic login`
// uses it. C4, the PR that switches `prismic login` to the device flow, deletes
// this file and tests login end to end instead.

import { randomBytes, randomUUID } from "node:crypto";
import { chown, mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, vi } from "vitest";

import type { Session } from "../src/credentials";
import type * as Keyring from "../src/lib/keyring";
import { it } from "./it";

// Replaces the system keychain. Set a reason in `keychain.fail` to make that
// call throw.
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

const DECRYPT_ERROR = "Your Prismic login can't be decrypted. Run `prismic login` again.";
const LOCKED_ERROR =
	"Can't read your Prismic key because the keychain is locked in this session. Unlock it and try again, or log in again with PRISMIC_CREDENTIALS_STORE=file.";

const session = {
	host: "prismic.io",
	auth0Domain: "auth0.prismic.io",
	clientId: "client-id",
	email: "dev@example.com",
	accessToken: "access-token-secret",
	refreshToken: "refresh-token-secret",
	expiresAt: 1_800_000_000_000,
};

// src/env.ts requires PROD, which the build defines. Vitest sets it to "".
process.env.PROD = "false";

// Imports the store as a new process would, with its own config directory.
async function loadStore(dir: URL, setting = "") {
	vi.resetModules();
	process.env.PRISMIC_CONFIG_DIR = fileURLToPath(dir);
	process.env.PRISMIC_CREDENTIALS_STORE = setting;
	return import("../src/credentials");
}

async function logIn(store: Awaited<ReturnType<typeof loadStore>>, saved: Session = session) {
	const choice = await store.prepareLogin();
	const lock = await store.lockCredentials({ timeoutMs: 5_000 });
	await store.writeCredentials(lock, { ...choice, session: saved });
	await lock.release();
	return choice;
}

// The tests share the keychain and the environment.
describe("credential store", { concurrent: false }, () => {
	beforeEach(() => {
		keychain.items.clear();
		keychain.fail = {};
	});

	it("round trips a keyring login, with a fresh nonce on every write", async ({ home }) => {
		const store = await loadStore(home);
		const saved = {
			...session,
			pendingLogin: {
				host: session.host,
				auth0Domain: session.auth0Domain,
				clientId: session.clientId,
				deviceCode: "device-code-secret",
				userCode: "BCDF-GHJK",
				verificationUri: "https://auth0.prismic.io/activate",
				expiresAt: 1_800_000_900_000,
				intervalMs: 5_000,
			},
		};

		expect(await logIn(store, saved)).toEqual({ store: "keyring" });
		const first = await readFile(new URL("credentials.enc", home));
		await logIn(store, saved);
		const second = await readFile(new URL("credentials.enc", home));

		// Format byte, then the 12-byte nonce.
		expect(first.subarray(1, 13).equals(second.subarray(1, 13))).toBe(false);
		expect(first.toString("latin1")).not.toContain(session.refreshToken);
		expect(first.toString("latin1")).not.toContain("device-code-secret");
		expect(JSON.parse(await readFile(new URL("credentials.json", home), "utf8"))).toEqual({
			version: 2,
			host: session.host,
			email: session.email,
			expiresAt: session.expiresAt,
			store: "keyring",
			auth0Domain: session.auth0Domain,
			clientId: session.clientId,
		});
		expect(await (await loadStore(home)).readCredentials()).toEqual({
			host: session.host,
			login: { store: "keyring", session: saved },
		});
	});

	it("rejects a tampered file, a wrong key and a missing key", async ({ home }) => {
		const encryptedPath = new URL("credentials.enc", home);
		await logIn(await loadStore(home));
		const original = await readFile(encryptedPath);
		const [[name, key]] = keychain.items;

		const tampered = Buffer.from(original);
		tampered[tampered.length - 1] ^= 1;
		await writeFile(encryptedPath, tampered);
		await expect((await loadStore(home)).readCredentials()).rejects.toMatchObject({
			reason: "decrypt-failed",
			message: DECRYPT_ERROR,
		});

		await writeFile(encryptedPath, original);
		keychain.items.set(name, randomBytes(32).toString("base64"));
		await expect((await loadStore(home)).readCredentials()).rejects.toMatchObject({
			reason: "decrypt-failed",
			message: DECRYPT_ERROR,
		});

		keychain.items.clear();
		await expect((await loadStore(home)).readCredentials()).rejects.toMatchObject({
			reason: "missing-key",
			message: DECRYPT_ERROR,
		});

		keychain.items.set(name, key);
		expect((await (await loadStore(home)).readCredentials()).login?.session).toEqual(session);
	});

	it("auto falls back to a plaintext file when the keychain fails at login", async ({ home }) => {
		const cases = [
			["module-missing", "module-missing"],
			["unavailable", "secret-service-missing"],
			["locked", "locked"],
			["rejected", "write-rejected"],
			["timeout", "timeout"],
		] as const;
		for (const [keyringReason, reason] of cases) {
			keychain.fail.set = keyringReason;
			const store = await loadStore(new URL(`${reason}/`, home), "auto");

			const choice = await logIn(store);
			expect(choice).toMatchObject({ store: "file", storeReason: reason });
			expect(choice).toHaveProperty(
				"warning",
				expect.stringMatching(
					/^No usable keychain \(.+\)\. Saved your login in .+credentials\.json, readable only by you\.$/,
				),
			);
			expect(await (await loadStore(new URL(`${reason}/`, home))).readCredentials()).toEqual({
				host: session.host,
				login: { store: "file", storeReason: reason, session },
			});
		}
	});

	it("keyring mode fails instead of falling back", async ({ home }) => {
		keychain.fail.set = "locked";
		const store = await loadStore(home, "keyring");
		await expect(store.prepareLogin()).rejects.toMatchObject({
			reason: "keychain-unavailable",
			message: expect.stringContaining("no usable keychain (the keychain is locked)"),
		});
	});

	it("file mode keeps everything in credentials.json and never touches the keychain", async ({
		home,
	}) => {
		keychain.fail = { get: "rejected", set: "rejected", delete: "rejected" };
		const store = await loadStore(home, "file");

		expect(await logIn(store)).toEqual({ store: "file", storeReason: "forced" });
		expect(JSON.parse(await readFile(new URL("credentials.json", home), "utf8"))).toEqual({
			version: 2,
			store: "file",
			storeReason: "forced",
			...session,
		});
		expect(await readdir(home)).not.toContain("credentials.enc");
		expect(await store.readCredentials()).toEqual({
			host: session.host,
			login: { store: "file", storeReason: "forced", session },
		});
	});

	it("never switches modes after login, and a failed key read isn't a logout", async ({ home }) => {
		await logIn(await loadStore(home, "auto"));

		// The setting only matters at login.
		keychain.fail.get = "locked";
		await expect((await loadStore(home, "file")).readCredentials()).rejects.toMatchObject({
			reason: "locked",
			message: LOCKED_ERROR,
		});

		keychain.fail.get = "timeout";
		await expect((await loadStore(home, "file")).readCredentials()).rejects.toMatchObject({
			reason: "timeout",
		});
	});

	it("rejects an unknown setting", async ({ home }) => {
		const store = await loadStore(home, "keychain");
		await expect(store.prepareLogin()).rejects.toMatchObject({ reason: "invalid-setting" });
	});

	it("reuses one key per config directory", async ({ home }) => {
		await logIn(await loadStore(new URL("a/", home)));
		const [[account, key]] = keychain.items;
		await logIn(await loadStore(new URL("a/", home)));
		expect([...keychain.items]).toEqual([[account, key]]);
		expect(account).toMatch(/^prismic-cli cli:[0-9a-f]{16}$/);

		await logIn(await loadStore(new URL("b/", home)));
		expect(keychain.items.size).toBe(2);
	});

	it("creates a new key at login when another process deleted it", async ({ home }) => {
		const store = await loadStore(home);
		await logIn(store);
		await store.readCredentials();

		keychain.items.clear();
		await logIn(store);
		expect(keychain.items.size).toBe(1);
		expect((await (await loadStore(home)).readCredentials()).login?.session).toEqual(session);
	});

	it.skipIf(process.platform === "win32")(
		"writes a private directory and private files through temporary files",
		async ({ home }) => {
			const dir = new URL("config/", home);
			await mkdir(dir, { mode: 0o755 });
			await logIn(await loadStore(dir));

			expect((await stat(dir)).mode & 0o777).toBe(0o700);
			expect((await stat(new URL("credentials.json", dir))).mode & 0o777).toBe(0o600);
			expect((await stat(new URL("credentials.enc", dir))).mode & 0o777).toBe(0o600);
			expect((await readdir(dir)).sort()).toEqual(["credentials.enc", "credentials.json"]);
		},
	);

	it.skipIf(process.platform === "win32")(
		"refuses symlinked credential files",
		async ({ home }) => {
			const dir = new URL("config/", home);
			await logIn(await loadStore(dir));
			const elsewhere = new URL("elsewhere/", home);
			await mkdir(elsewhere);

			for (const name of ["credentials.enc", "credentials.json"]) {
				const path = new URL(name, dir);
				await writeFile(new URL(name, elsewhere), await readFile(path));
				await rm(path);
				await symlink(new URL(name, elsewhere), path);

				await expect((await loadStore(dir)).readCredentials()).rejects.toMatchObject({
					reason: "unsafe-file",
					message: expect.stringContaining("because it's a symbolic link"),
				});
				await rm(path);
				await writeFile(path, await readFile(new URL(name, elsewhere)), { mode: 0o600 });
			}
		},
	);

	// Changing a file's owner needs root, so this runs only as root.
	it.skipIf(process.getuid?.() !== 0)(
		"refuses files that belong to another user",
		async ({ home }) => {
			await writeFile(new URL("credentials.json", home), JSON.stringify({ token: "t", host: "h" }));
			await chown(new URL("credentials.json", home), 65534, 65534);
			await expect((await loadStore(home)).readCredentials()).rejects.toMatchObject({
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
			return (await loadStore(dir)).readCredentials();
		};

		expect(await read("nothing", undefined)).toEqual({});
		expect(await read("host-only", JSON.stringify({ host: "wroom.io" }))).toEqual({
			host: "wroom.io",
		});
		expect(await read("version-1", JSON.stringify({ token: "token", host: "wroom.io" }))).toEqual({
			host: "wroom.io",
		});
		if (process.platform !== "win32") {
			const mode = (await stat(new URL("version-1/credentials.json", home))).mode & 0o777;
			expect(mode).toBe(0o600);
		}
		expect(await read("invalid", "{")).toEqual({});
		expect(
			await read(
				"unknown-reason",
				JSON.stringify({ version: 2, store: "file", storeReason: "new-reason", ...session }),
			),
		).toEqual({ host: session.host, login: { store: "file", session } });
		await expect(
			read("damaged", JSON.stringify({ version: 2, store: "file", host: null })),
		).rejects.toMatchObject({ reason: "decrypt-failed" });
		await expect(read("newer", JSON.stringify({ version: 3 }))).rejects.toMatchObject({
			reason: "unsupported-version",
		});
	});

	it("drops writes from a process that lost the lock", async ({ home }) => {
		const store = await loadStore(home, "file");
		const stalled = await store.lockCredentials({ timeoutMs: 5_000 });

		// Another process took the lock over.
		await rm(new URL("credentials.lock", home), { recursive: true });
		const current = await store.lockCredentials({ timeoutMs: 5_000 });
		await store.writeCredentials(current, { store: "file", session });

		await expect(
			store.writeCredentials(stalled, {
				store: "file",
				session: { ...session, accessToken: "old" },
			}),
		).rejects.toMatchObject({ reason: "lock-lost" });
		await expect(store.clearCredentials(stalled)).rejects.toMatchObject({ reason: "lock-lost" });
		expect((await store.readCredentials()).login?.session).toEqual(session);
		await current.release();
	});

	it("logout deletes the session and the key, and keeps the host", async ({ home }) => {
		const store = await loadStore(home);
		await logIn(store);

		const lock = await store.lockCredentials({ timeoutMs: 5_000 });
		await store.clearCredentials(lock);
		await lock.release();
		expect(await store.readCredentials()).toEqual({ host: session.host });
		expect(await readdir(home)).not.toContain("credentials.enc");
		expect(keychain.items.size).toBe(0);

		await logIn(store);
		keychain.fail.delete = "locked";
		const again = await store.lockCredentials({ timeoutMs: 5_000 });
		await expect(store.clearCredentials(again)).rejects.toMatchObject({
			reason: "locked",
			message: expect.stringContaining("Can't delete your Prismic key"),
		});
		await again.release();
		expect(await store.readCredentials()).toEqual({ host: session.host });
	});
});

it("round trips a key through the system keychain", async () => {
	const { systemKeyring } = await vi.importActual<typeof Keyring>("../src/lib/keyring");
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
