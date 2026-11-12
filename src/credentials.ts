import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm, stat } from "node:fs/promises";
import { release } from "node:os";
import { fileURLToPath } from "node:url";

import * as z from "zod/mini";

import {
	CONFIG_DIR,
	CREDENTIALS_LOCK_PATH,
	CREDENTIALS_PATH,
	ENCRYPTED_CREDENTIALS_PATH,
	LOGIN_LOCK_PATH,
} from "./config";
import { PendingLoginSchema } from "./lib/auth0";
import { exists } from "./lib/file";
import { stringify } from "./lib/json";
import { KeyringError, systemKeyring, type KeyringErrorReason } from "./lib/keyring";
import { acquireLock, type Lock } from "./lib/lock";

const KEYCHAIN_SERVICE = "prismic-cli";
const KEYCHAIN_ACCOUNT = `cli:${createHash("sha256").update(fileURLToPath(CONFIG_DIR)).digest("hex").slice(0, 16)}`;
const KEYCHAIN_LOGIN_TIMEOUT_MS = 5_000;
// Holders keep it for about one request, and a stale lock is recovered after
// 10 seconds.
const CREDENTIALS_LOCK_TIMEOUT_MS = 30_000;
// Leaves time to answer the keychain's unlock dialog.
const KEYCHAIN_TIMEOUT_MS = 30_000;

// credentials.enc starts with this byte, then a 12-byte nonce and a 16-byte
// tag, then the ciphertext.
const ENCRYPTED_FORMAT = Buffer.from([1]);

const SessionSchema = z.object({
	host: z.string(),
	auth0Domain: z.string(),
	clientId: z.string(),
	email: z.optional(z.string()),
	accessToken: z.optional(z.string()),
	refreshToken: z.optional(z.string()),
	/** Milliseconds since the epoch, from the local time of receipt. */
	expiresAt: z.optional(z.number()),
	pendingLogin: z.optional(PendingLoginSchema),
});
export type Session = z.infer<typeof SessionSchema>;

const FallbackReasonSchema = z.enum([
	"wsl",
	"secret-service-missing",
	"locked",
	"write-rejected",
	"timeout",
	"module-missing",
]);
export type FallbackReason = z.infer<typeof FallbackReasonSchema>;

const CredentialsVersionSchema = z.looseObject({
	version: z.optional(z.unknown()),
	store: z.optional(z.unknown()),
	storeReason: z.optional(z.unknown()),
});
const CredentialsHostSchema = z.looseObject({ host: z.optional(z.string()) });

export type StoreMode = "keyring" | "file";

// `storeReason` says why a login went to a file, for telemetry.
export type StoredLogin = { store: StoreMode; storeReason?: FallbackReason; session: Session };

export type StoredCredentials = {
	host?: string;
	login?: StoredLogin;
};

let key: Buffer | undefined;
let warnedUnsafe = false;

// A login that exists but can't be read throws, never reads as logged out.
export async function readCredentials(): Promise<StoredCredentials> {
	const json = parseJson(await readPrivateFile(CREDENTIALS_PATH));
	const file = z.safeParse(CredentialsVersionSchema, json);
	if (!file.success) return {};
	const { version, store, storeReason } = file.data;

	// Without a version, the file has only `host` (website generator), or is
	// version 1, whose token expires within hours and can't be refreshed.
	if (version === undefined) {
		const host = z.safeParse(CredentialsHostSchema, json).data?.host;
		return host ? { host } : {};
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
		store === "file" ? json : parseJson(await decryptSession()),
	);
	if (!session.success) throw undecryptable();

	// An unknown reason reads as none.
	const reason = store === "file" ? z.safeParse(FallbackReasonSchema, storeReason).data : undefined;
	return {
		host: session.data.host,
		login: { store, ...(reason ? { storeReason: reason } : {}), session: session.data },
	};
}

// Every version keeps the host in plain text, so reading it needs no key.
export async function readHost(): Promise<string | undefined> {
	const json = parseJson(await readPrivateFile(CREDENTIALS_PATH));
	return z.safeParse(CredentialsHostSchema, json).data?.host;
}

const FALLBACK_REASONS: Record<KeyringErrorReason, FallbackReason> = {
	"module-missing": "module-missing",
	unavailable: "secret-service-missing",
	locked: "locked",
	rejected: "write-rejected",
	timeout: "timeout",
};

// Only a login calls this, in the same lock hold as the write that uses its
// key, so two logins can't each create a key and then encrypt with the one
// that lost, and a logout can't delete the key in between.
export async function prepareLogin(
	lock: Lock,
): Promise<{ store: "keyring" } | { store: "file"; storeReason: FallbackReason }> {
	if (process.platform === "linux" && /microsoft/i.test(release())) {
		return { store: "file", storeReason: "wsl" };
	}

	try {
		// Another process may have deleted the key since this one read it.
		key = undefined;
		if (!(await readKey(KEYCHAIN_LOGIN_TIMEOUT_MS))) {
			const newKey = randomBytes(32);
			await assertHeld(lock);
			await systemKeyring.set(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, newKey.toString("base64"), {
				timeoutMs: KEYCHAIN_LOGIN_TIMEOUT_MS,
			});
			key = newKey;
		}
		return { store: "keyring" };
	} catch (error) {
		if (!(error instanceof KeyringError)) throw error;
		return { store: "file", storeReason: FALLBACK_REASONS[error.reason] };
	}
}

export async function writeCredentials(
	lock: Lock,
	login: StoredLogin,
): Promise<{ warning?: string }> {
	const { store, storeReason, session } = login;
	let safe;
	if (store === "keyring") {
		const { host, email, expiresAt, auth0Domain, clientId } = session;
		safe = await writePrivateFiles(lock, [
			// credentials.enc is authoritative, so it's written first.
			[ENCRYPTED_CREDENTIALS_PATH, encrypt(JSON.stringify(session), await requireKey())],
			[
				CREDENTIALS_PATH,
				stringify({ version: 2, host, email, expiresAt, store, auth0Domain, clientId }),
			],
		]);
	} else {
		safe = await writePrivateFiles(lock, [
			[CREDENTIALS_PATH, stringify({ version: 2, store, storeReason, ...session })],
		]);
		await removeFile(lock, ENCRYPTED_CREDENTIALS_PATH);
	}

	if (safe || warnedUnsafe) return {};
	warnedUnsafe = true;
	return {
		warning: `Can't make ${fileURLToPath(CREDENTIALS_PATH)} readable only by you on this disk. Set PRISMIC_CONFIG_DIR to a private folder on another disk.`,
	};
}

export async function clearCredentials(lock: Lock): Promise<void> {
	const json = parseJson(await readPrivateFile(CREDENTIALS_PATH).catch(() => undefined));
	const host = z.safeParse(CredentialsHostSchema, json).data?.host;
	const hadKey =
		z.safeParse(CredentialsVersionSchema, json).data?.store === "keyring" ||
		(await exists(ENCRYPTED_CREDENTIALS_PATH));

	if (host) await writePrivateFiles(lock, [[CREDENTIALS_PATH, stringify({ host })]]);
	else await removeFile(lock, CREDENTIALS_PATH);
	await removeFile(lock, ENCRYPTED_CREDENTIALS_PATH);

	if (!hadKey) return;
	key = undefined;
	await assertHeld(lock);
	await systemKeyring
		.delete(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, { timeoutMs: KEYCHAIN_TIMEOUT_MS })
		.catch((error) => {
			throw keyringFailure(error, "delete");
		});
}

export async function lockCredentials(): Promise<Lock> {
	await ensurePrivateDir();
	return acquireLock(CREDENTIALS_LOCK_PATH, { timeoutMs: CREDENTIALS_LOCK_TIMEOUT_MS });
}

// A login holds this one while it waits for approval, so one command polls for
// a config directory, and others can still refresh or log out meanwhile.
export async function lockLogin(config: { timeoutMs: number }): Promise<Lock> {
	await ensurePrivateDir();
	return acquireLock(LOGIN_LOCK_PATH, config);
}

export type CredentialsErrorReason =
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

async function readKey(timeoutMs: number): Promise<Buffer | undefined> {
	if (key) return key;
	const value = await systemKeyring.get(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, { timeoutMs });
	const decoded = value ? Buffer.from(value, "base64") : undefined;
	if (decoded?.length === 32) key = decoded;
	return key;
}

async function requireKey(): Promise<Buffer> {
	const currentKey = await readKey(KEYCHAIN_TIMEOUT_MS).catch((error) => {
		throw keyringFailure(error);
	});
	if (!currentKey) throw undecryptable("missing-key");
	return currentKey;
}

async function decryptSession(): Promise<string | undefined> {
	const encrypted = await readPrivateFile(ENCRYPTED_CREDENTIALS_PATH);
	const wasCached = key !== undefined;
	const plaintext = decrypt(encrypted, await requireKey());
	if (plaintext || !wasCached) return plaintext;

	// Another process may have logged in again, with a new key, since this one
	// read it.
	key = undefined;
	return decrypt(encrypted, await requireKey());
}

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
	// A new login saves to a file when the keychain can't be used.
	const alternative = action === "read" ? ", or run `prismic login` again" : "";
	return new CredentialsError(
		reason,
		`Can't ${action} your Prismic key because ${why}${alternative}.`,
		{ cause: error },
	);
}

function undecryptable(reason: "missing-key" | "decrypt-failed" = "decrypt-failed"): Error {
	return new CredentialsError(
		reason,
		"Your Prismic login can't be decrypted. Run `prismic login` again.",
	);
}

// Checked right before each rename or delete, so a stalled process can't
// overwrite a newer login or restore a session after a logout.
async function assertHeld(lock: Lock): Promise<void> {
	if (await lock.isHeld()) return;
	throw new CredentialsError(
		"lock-lost",
		"Another Prismic command took over the login while this one stalled. Run the command again.",
	);
}

function encrypt(plaintext: string, key: Buffer): Buffer {
	const nonce = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, nonce);
	cipher.setAAD(ENCRYPTED_FORMAT);
	const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	return Buffer.concat([ENCRYPTED_FORMAT, nonce, cipher.getAuthTag(), ciphertext]);
}

function decrypt(data: Buffer | undefined, key: Buffer): string | undefined {
	if (!data || data.length < 29 || data[0] !== ENCRYPTED_FORMAT[0]) return undefined;
	try {
		const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(1, 13));
		decipher.setAAD(ENCRYPTED_FORMAT);
		decipher.setAuthTag(data.subarray(13, 29));
		return Buffer.concat([decipher.update(data.subarray(29)), decipher.final()]).toString("utf8");
	} catch {
		return undefined;
	}
}

// On Windows, files rely on %APPDATA%'s ACLs instead of modes.
async function ensurePrivateDir(): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
	if (process.platform === "win32") return;
	if (((await stat(CONFIG_DIR)).mode & 0o077) !== 0) await chmod(CONFIG_DIR, 0o700);
}

// Returns false when a file isn't private, because the disk ignores modes, like
// WSL's /mnt/c.
async function writePrivateFiles(lock: Lock, files: [URL, string | Buffer][]): Promise<boolean> {
	await ensurePrivateDir();
	let safe = true;
	for (const [path, data] of files) {
		const temporaryPath = new URL(`${path.href}.${randomUUID()}.tmp`);
		try {
			const handle = await open(temporaryPath, "wx", 0o600);
			try {
				await handle.writeFile(data);
				await handle.sync();
			} finally {
				await handle.close();
			}
			await assertHeld(lock);
			await rename(temporaryPath, path);
		} catch (error) {
			await rm(temporaryPath, { force: true });
			throw error;
		}

		if (process.platform === "win32") continue;
		const stats = await lstat(path);
		if ((stats.mode & 0o777) !== 0o600 || stats.uid !== process.getuid?.()) safe = false;
	}
	return safe;
}

async function removeFile(lock: Lock, path: URL): Promise<void> {
	await assertHeld(lock);
	await rm(path, { force: true });
}

async function readPrivateFile(path: URL): Promise<Buffer | undefined> {
	const unsafe = (why: string) =>
		new CredentialsError(
			"unsafe-file",
			`Refusing to read ${fileURLToPath(path)} because ${why}. Delete it and run \`prismic login\` again.`,
		);

	let handle;
	try {
		if (process.platform === "win32" && (await lstat(path)).isSymbolicLink()) {
			throw unsafe("it's a symbolic link");
		}
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
		if (process.platform === "win32") return await handle.readFile();
		if (stats.uid !== process.getuid?.()) throw unsafe("it belongs to another user");
		// Older versions wrote credentials.json with the default mode.
		if ((stats.mode & 0o077) !== 0) await handle.chmod(0o600).catch(() => {});
		return await handle.readFile();
	} finally {
		await handle.close();
	}
}

function parseJson(data: Buffer | string | undefined): unknown {
	try {
		return data && JSON.parse(data.toString());
	} catch {
		return undefined;
	}
}
