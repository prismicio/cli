import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm, stat } from "node:fs/promises";
import { release } from "node:os";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as z from "zod/mini";

import { CONFIG_DIR } from "./config";
import { env } from "./env";
import { exists } from "./lib/file";
import { stringify } from "./lib/json";
import { KeyringError, systemKeyring, type Keyring, type KeyringErrorReason } from "./lib/keyring";
import { acquireLock, type Lock, type LockOptions } from "./lib/lock";
import { PendingLoginSchema } from "./lib/prismic/device-flow";

// The login lives in the config directory:
// - credentials.json: plain metadata. In file mode, also the secrets.
// - credentials.enc: in keyring mode, the session, encrypted with a key from
//   the OS keychain. Authoritative over credentials.json.
// - credentials.lock: held while a login, refresh or logout writes.
//
// The keychain holds one key per config directory, never tokens, so refreshes
// never write to it.

const KEYCHAIN_SERVICE = "prismic-cli";
// At login, a slower keychain means no usable keychain.
const KEYCHAIN_LOGIN_TIMEOUT_MS = 5_000;
// After login, leave time to answer an unlock dialog.
const KEYCHAIN_TIMEOUT_MS = 30_000;

export type StoreMode = "keyring" | "file";

export type FallbackReason =
	| "forced"
	| "wsl"
	| "secret-service-missing"
	| "locked"
	| "write-rejected"
	| "timeout"
	| "module-missing";

export type CredentialsErrorReason =
	| "invalid-setting"
	| "unsupported-version"
	| "unsafe-file"
	| "lock-lost"
	| "locked"
	| "timeout"
	| "keychain-unavailable"
	| "missing-key"
	| "decrypt-failed";

export class CredentialsError extends Error {
	name = "CredentialsError";
	reason: CredentialsErrorReason;

	constructor(reason: CredentialsErrorReason, message: string, options?: ErrorOptions) {
		super(message, options);
		this.reason = reason;
	}
}

// The domain and client ID are the ones that issued the session, so refresh
// and logout use them.
const SessionSchema = z.object({
	host: z.string(),
	domain: z.string(),
	clientId: z.string(),
	email: z.optional(z.string()),
	accessToken: z.optional(z.string()),
	refreshToken: z.optional(z.string()),
	/** Local time of receipt plus `expires_in`, in milliseconds. */
	expiresAt: z.optional(z.number()),
	pendingLogin: z.optional(PendingLoginSchema),
});
export type Session = z.infer<typeof SessionSchema>;

// credentials.json: version 2, or no version: only `host` (website
// generator), or version 1 with a `token`.
const VersionSchema = z.looseObject({
	version: z.optional(z.unknown()),
	store: z.optional(z.unknown()),
});
const LegacySchema = z.looseObject({
	host: z.optional(z.string()),
	token: z.optional(z.string()),
});

export type StoredCredentials = {
	/** The host, from any version of credentials.json. */
	host?: string;
	/** A version 1 token, used until a request rejects it. */
	legacyToken?: string;
	/** A version 2 login. */
	login?: { store: StoreMode; session: Session };
};

export type CredentialStore = {
	/**
	 * Reads the stored login. A login that exists but can't be read throws a
	 * `CredentialsError`, never returns "not logged in".
	 */
	read(): Promise<StoredCredentials>;
	/**
	 * Picks where a new login goes, and creates the keychain key if needed.
	 * Only a login calls this, under the lock it keeps until `write`, so `auto`
	 * falls back to a file only at login.
	 */
	prepareLogin(): Promise<
		{ store: "keyring" } | { store: "file"; reason: FallbackReason; warning?: string }
	>;
	/**
	 * Saves a login in the given mode. Throws if `lock` was lost, so a stalled
	 * process can't overwrite a newer login.
	 */
	write(lock: Lock, login: { store: StoreMode; session: Session }): Promise<{ warning?: string }>;
	/** Deletes the session and the keychain key. Keeps the host. */
	clear(lock: Lock): Promise<void>;
	lock(options: Pick<LockOptions, "timeoutMs">): Promise<Lock>;
};

export function createCredentialStore(
	config: { dir?: URL; keyring?: Keyring; setting?: string } = {},
): CredentialStore {
	const {
		dir = CONFIG_DIR,
		keyring = systemKeyring,
		setting = env.PRISMIC_CREDENTIALS_STORE || "auto",
	} = config;

	const jsonPath = new URL("credentials.json", dir);
	const encPath = new URL("credentials.enc", dir);
	const lockPath = new URL("credentials.lock", dir);
	const keychainAccount = `cli:${createHash("sha256")
		.update(resolve(fileURLToPath(dir)))
		.digest("hex")
		.slice(0, 16)}`;

	// The key is read at most once per process.
	let key: Buffer | undefined;
	let warnedUnsafe = false;

	async function readKey(timeoutMs: number): Promise<Buffer | undefined> {
		if (key) return key;
		const value = await keyring.get(KEYCHAIN_SERVICE, keychainAccount, { timeoutMs });
		const decoded = value ? Buffer.from(value, "base64") : undefined;
		if (decoded?.length === 32) key = decoded;
		return key;
	}

	async function requireKey(): Promise<Buffer> {
		const current = await readKey(KEYCHAIN_TIMEOUT_MS).catch((error) => {
			throw keyringFailure(error);
		});
		if (!current) throw undecryptable("missing-key");
		return current;
	}

	async function writeFiles(lock: Lock, files: [URL, string | Buffer][]): Promise<boolean> {
		await ensurePrivateDir(dir);
		let safe = true;
		for (const [path, data] of files) {
			safe = (await writePrivateFile(lock, path, data)) && safe;
		}
		return safe;
	}

	return {
		async read() {
			const json = parseJson(await readPrivateFile(jsonPath));
			const file = z.safeParse(VersionSchema, json);
			if (!file.success) return {};
			const { version, store } = file.data;

			if (version === undefined) {
				const legacy = z.safeParse(LegacySchema, json);
				if (!legacy.success) return {};
				const { host, token } = legacy.data;
				return token ? { host, legacyToken: token } : { host };
			}
			if (version !== 2) {
				throw new CredentialsError(
					"unsupported-version",
					"Your Prismic login was saved by a newer version of the CLI. Update the CLI, or run `prismic login` again.",
				);
			}
			if (store !== "keyring" && store !== "file") throw undecryptable();

			const session = z.safeParse(
				SessionSchema,
				store === "file"
					? json
					: parseJson(decrypt(await readPrivateFile(encPath), await requireKey())),
			);
			if (!session.success) throw undecryptable();
			return { host: session.data.host, login: { store, session: session.data } };
		},

		async prepareLogin() {
			if (setting !== "auto" && setting !== "keyring" && setting !== "file") {
				throw new CredentialsError(
					"invalid-setting",
					`PRISMIC_CREDENTIALS_STORE must be auto, keyring or file, not "${setting}".`,
				);
			}
			if (setting === "file") return { store: "file", reason: "forced" };

			const fallback = (reason: Exclude<FallbackReason, "forced">) => ({
				store: "file" as const,
				reason,
				warning: `No usable keychain (${FALLBACK_DESCRIPTIONS[reason]}). Saved your login in ${fileURLToPath(jsonPath)}, readable only by you.`,
			});

			if (setting === "auto" && process.platform === "linux" && /microsoft/i.test(release())) {
				return fallback("wsl");
			}

			try {
				// Another process may have deleted the key since this one read it.
				key = undefined;
				if (!(await readKey(KEYCHAIN_LOGIN_TIMEOUT_MS))) {
					const newKey = randomBytes(32);
					await keyring.set(KEYCHAIN_SERVICE, keychainAccount, newKey.toString("base64"), {
						timeoutMs: KEYCHAIN_LOGIN_TIMEOUT_MS,
					});
					key = newKey;
				}
				return { store: "keyring" };
			} catch (error) {
				if (!(error instanceof KeyringError)) throw error;
				const reason = FALLBACK_REASONS[error.reason];
				if (setting === "keyring") {
					throw new CredentialsError(
						"keychain-unavailable",
						`PRISMIC_CREDENTIALS_STORE is keyring, but there's no usable keychain (${FALLBACK_DESCRIPTIONS[reason]}). Set it to auto or file to save your login in a file readable only by you.`,
						{ cause: error },
					);
				}
				return fallback(reason);
			}
		},

		async write(lock, { store, session }) {
			let safe;
			if (store === "keyring") {
				const { host, email, expiresAt, domain, clientId } = session;
				safe = await writeFiles(lock, [
					// The encrypted file is authoritative, so it's written first.
					[encPath, encrypt(JSON.stringify(session), await requireKey())],
					[jsonPath, stringify({ version: 2, host, email, expiresAt, store, domain, clientId })],
				]);
			} else {
				safe = await writeFiles(lock, [[jsonPath, stringify({ version: 2, store, ...session })]]);
				await removeFile(lock, encPath);
			}

			if (safe || warnedUnsafe) return {};
			warnedUnsafe = true;
			return {
				warning: `Can't make ${fileURLToPath(jsonPath)} readable only by you on this disk. Set PRISMIC_CONFIG_DIR to a private folder on another disk.`,
			};
		},

		async clear(lock) {
			const json = parseJson(await readPrivateFile(jsonPath).catch(() => undefined));
			const host = z.safeParse(LegacySchema, json).data?.host;
			const hadKey =
				z.safeParse(VersionSchema, json).data?.store === "keyring" || (await exists(encPath));

			if (host) await writeFiles(lock, [[jsonPath, stringify({ host })]]);
			else await removeFile(lock, jsonPath);
			await removeFile(lock, encPath);

			if (!hadKey) return;
			key = undefined;
			await assertHeld(lock);
			await keyring
				.delete(KEYCHAIN_SERVICE, keychainAccount, { timeoutMs: KEYCHAIN_TIMEOUT_MS })
				.catch((error) => {
					throw keyringFailure(error, "delete");
				});
		},

		async lock(options) {
			await ensurePrivateDir(dir);
			return acquireLock(lockPath, options);
		},
	};
}

const FALLBACK_REASONS: Record<KeyringError["reason"], Exclude<FallbackReason, "forced">> = {
	"module-missing": "module-missing",
	unavailable: "secret-service-missing",
	locked: "locked",
	rejected: "write-rejected",
	timeout: "timeout",
};

const FALLBACK_DESCRIPTIONS: Record<Exclude<FallbackReason, "forced">, string> = {
	wsl: "WSL",
	"secret-service-missing": "Secret Service isn't available",
	locked: "the keychain is locked",
	"write-rejected": "the keychain rejected the key",
	timeout: "the keychain didn't respond",
	"module-missing": "the keychain module didn't load",
};

const KEYCHAIN_FAILURES: Partial<Record<KeyringErrorReason, [CredentialsErrorReason, string]>> = {
	locked: ["locked", "the keychain is locked in this session. Unlock it and try again"],
	timeout: ["timeout", "the keychain didn't respond. Try again"],
};

function keyringFailure(error: unknown, action: "read" | "delete" = "read"): unknown {
	if (!(error instanceof KeyringError)) return error;
	const [reason, why] = KEYCHAIN_FAILURES[error.reason] ?? [
		"keychain-unavailable",
		"the keychain isn't available. Try again",
	];
	return new CredentialsError(
		reason,
		`Can't ${action} your Prismic key because ${why}, or log in again with PRISMIC_CREDENTIALS_STORE=file.`,
		{ cause: error },
	);
}

// A process that lost the lock drops its write, so a stalled refresh can't
// overwrite a newer login or restore a session after a logout. Checked right
// before each rename or delete.
async function assertHeld(lock: Lock): Promise<void> {
	if (await lock.isHeld()) return;
	throw new CredentialsError(
		"lock-lost",
		"Another Prismic command took over the login while this one stalled. Run the command again.",
	);
}

async function removeFile(lock: Lock, path: URL): Promise<void> {
	await assertHeld(lock);
	await rm(path, { force: true });
}

function undecryptable(reason: "missing-key" | "decrypt-failed" = "decrypt-failed"): Error {
	return new CredentialsError(
		reason,
		"Your Prismic login can't be decrypted. Run `prismic login` again.",
	);
}

// credentials.enc: a format byte, a 12-byte nonce, a 16-byte tag, then the
// AES-256-GCM ciphertext. Every write uses a fresh nonce.
const FORMAT = Buffer.from([1]);

function encrypt(plaintext: string, key: Buffer): Buffer {
	const nonce = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, nonce);
	cipher.setAAD(FORMAT);
	const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	return Buffer.concat([FORMAT, nonce, cipher.getAuthTag(), ciphertext]);
}

function decrypt(data: Buffer | undefined, key: Buffer): string | undefined {
	if (!data || data.length < 29 || data[0] !== FORMAT[0]) return undefined;
	try {
		const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(1, 13));
		decipher.setAAD(FORMAT);
		decipher.setAuthTag(data.subarray(13, 29));
		return Buffer.concat([decipher.update(data.subarray(29)), decipher.final()]).toString("utf8");
	} catch {
		return undefined;
	}
}

const IS_WINDOWS = process.platform === "win32";

// On Windows, files rely on %APPDATA%'s ACLs instead of modes.
async function ensurePrivateDir(dir: URL): Promise<void> {
	await mkdir(dir, { recursive: true, mode: 0o700 });
	if (IS_WINDOWS) return;
	if (((await stat(dir)).mode & 0o077) !== 0) await chmod(dir, 0o700);
}

// Writes to a new temporary file, then renames it over the old one, so a
// killed process never leaves a partial file. Returns whether the file ended
// up private: some disks ignore modes (WSL's /mnt/c, network mounts).
async function writePrivateFile(lock: Lock, path: URL, data: string | Buffer): Promise<boolean> {
	const temporary = new URL(`.${basename(fileURLToPath(path))}.${randomUUID()}.tmp`, path);
	try {
		const handle = await open(temporary, "wx", 0o600);
		try {
			await handle.writeFile(data);
			await handle.sync();
		} finally {
			await handle.close();
		}
		await assertHeld(lock);
		await rename(temporary, path);
	} catch (error) {
		await rm(temporary, { force: true });
		throw error;
	}

	if (IS_WINDOWS) return true;
	const stats = await lstat(path);
	return (stats.mode & 0o777) === 0o600 && stats.uid === process.getuid?.();
}

// Refuses symlinks and files that belong to another user. Restricts the file's
// mode to 0600, for files written by older versions.
async function readPrivateFile(path: URL): Promise<Buffer | undefined> {
	const unsafe = (why: string) =>
		new CredentialsError(
			"unsafe-file",
			`Refusing to read ${fileURLToPath(path)} because ${why}. Delete it and run \`prismic login\` again.`,
		);

	let handle;
	try {
		if (IS_WINDOWS && (await lstat(path)).isSymbolicLink()) throw unsafe("it's a symbolic link");
		handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
	} catch (error) {
		const { code } = error as NodeJS.ErrnoException;
		if (code === "ENOENT") return undefined;
		if (code === "ELOOP") throw unsafe("it's a symbolic link");
		throw error;
	}

	try {
		const stats = await handle.stat();
		if (!stats.isFile()) throw unsafe("it isn't a regular file");
		if (IS_WINDOWS) return await handle.readFile();
		if (stats.uid !== process.getuid?.()) throw unsafe("it belongs to another user");
		if ((stats.mode & 0o077) !== 0) await handle.chmod(0o600).catch(() => {});
		return await handle.readFile();
	} finally {
		await handle.close();
	}
}

function parseJson(data: Buffer | string | undefined): unknown {
	try {
		return data === undefined ? undefined : JSON.parse(data.toString());
	} catch {
		return undefined;
	}
}
