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
import { acquireLock, type Lock, LockTimeoutError } from "./lib/lock";

const KEYCHAIN_SERVICE = "prismic-cli";
const KEYCHAIN_ACCOUNT = `cli:${createHash("sha256").update(fileURLToPath(CONFIG_DIR)).digest("hex").slice(0, 16)}`;
const KEYCHAIN_LOGIN_TIMEOUT_MS = 5_000;
// Holders keep it for about one request.
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

const StoreModeSchema = z.enum(["keyring", "file"]);
export type StoreMode = z.infer<typeof StoreModeSchema>;

// What every login keeps in plain text. A field that doesn't match reads as
// missing.
const LoginSummarySchema = z.object({
	version: z.optional(z.unknown()),
	host: z.catch(z.optional(z.string()), undefined),
	store: z.catch(z.optional(StoreModeSchema), undefined),
	storeReason: z.catch(z.optional(FallbackReasonSchema), undefined),
	/** Set while a session has tokens. */
	expiresAt: z.catch(z.optional(z.number()), undefined),
});
type LoginSummary = z.infer<typeof LoginSummarySchema>;

// `storeReason` says why a login went to a file, for telemetry.
export type StoredLogin = { store: StoreMode; storeReason?: FallbackReason; session: Session };

let key: Buffer | undefined;
let warnedUnsafe = false;

// A login that exists but can't be read throws, never reads as logged out.
export async function readCredentials(): Promise<{ login?: StoredLogin }> {
	const json = parseJson(await readPrivateFile(CREDENTIALS_PATH));
	const { version, store, storeReason } = z.safeParse(LoginSummarySchema, json).data ?? {};

	// Without a version, the file has only `host` (website generator), or is
	// version 1, whose token expires within hours and can't be refreshed.
	if (version === undefined) return {};
	if (version !== 2) {
		throw new CredentialsError(
			"Your Prismic login was saved by a newer version of the CLI. Update the CLI, or run `prismic login` again.",
		);
	}
	if (!store) throw undecryptable();

	const session = z.safeParse(
		SessionSchema,
		store === "file" ? json : parseJson(await decryptSession()),
	);
	if (!session.success) throw undecryptable();

	const reason = store === "file" ? storeReason : undefined;
	return { login: { store, ...(reason ? { storeReason: reason } : {}), session: session.data } };
}

// Reads what's in plain text, so it never needs the keychain. A file it can't
// read reads as empty.
export async function readLoginSummary(): Promise<LoginSummary> {
	const json = parseJson(await readPrivateFile(CREDENTIALS_PATH).catch(() => undefined));
	return z.safeParse(LoginSummarySchema, json).data ?? {};
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

// Warns once per process when the disk can't keep the files private.
export async function writeCredentials(lock: Lock, login: StoredLogin): Promise<void> {
	const { store, storeReason, session } = login;
	let safe;
	if (store === "keyring") {
		const { host, expiresAt, auth0Domain, clientId } = session;
		safe = await writePrivateFiles(lock, [
			// credentials.enc is authoritative, so it's written first.
			[ENCRYPTED_CREDENTIALS_PATH, encrypt(JSON.stringify(session), await requireKey())],
			[CREDENTIALS_PATH, stringify({ version: 2, host, expiresAt, store, auth0Domain, clientId })],
		]);
	} else {
		safe = await writePrivateFiles(lock, [
			[CREDENTIALS_PATH, stringify({ version: 2, store, storeReason, ...session })],
		]);
		await removeFile(lock, ENCRYPTED_CREDENTIALS_PATH);
	}

	if (safe || warnedUnsafe) return;
	warnedUnsafe = true;
	console.warn(
		`Can't make ${fileURLToPath(CREDENTIALS_PATH)} readable only by you on this disk. Set PRISMIC_CONFIG_DIR to a private folder on another disk.`,
	);
}

// The login is gone either way, so a key the keychain won't delete only gets a
// warning.
export async function clearCredentials(lock: Lock): Promise<void> {
	const { host, store } = await readLoginSummary();
	const hadKey = store === "keyring" || (await exists(ENCRYPTED_CREDENTIALS_PATH));

	if (host) await writePrivateFiles(lock, [[CREDENTIALS_PATH, stringify({ host })]]);
	else await removeFile(lock, CREDENTIALS_PATH);
	await removeFile(lock, ENCRYPTED_CREDENTIALS_PATH);

	if (!hadKey) return;
	key = undefined;
	await assertHeld(lock);
	await systemKeyring
		.delete(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, { timeoutMs: KEYCHAIN_TIMEOUT_MS })
		.catch((error) => {
			const failure = keyringFailure(error, "delete");
			if (!(failure instanceof CredentialsError)) throw failure;
			console.warn(failure.message);
		});
}

export async function lockCredentials(): Promise<Lock> {
	await ensurePrivateDir();
	return acquireLock(CREDENTIALS_LOCK_PATH, { timeoutMs: CREDENTIALS_LOCK_TIMEOUT_MS }).catch(
		(error) => {
			if (!(error instanceof LockTimeoutError)) throw error;
			throw new CredentialsError(
				"Another Prismic command is still using your login. Run the command again.",
			);
		},
	);
}

// A login holds this one while it waits for approval, so one command polls for
// a config directory, and others can still refresh or log out meanwhile.
export async function lockLogin(config: { timeoutMs: number }): Promise<Lock> {
	await ensurePrivateDir();
	return acquireLock(LOGIN_LOCK_PATH, config);
}

export class CredentialsError extends Error {
	name = "CredentialsError";
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
	if (!currentKey) throw undecryptable();
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

const KEYCHAIN_FAILURES: Partial<Record<KeyringErrorReason, string>> = {
	locked: "the keychain is locked in this session. Unlock it and try again",
	timeout: "the keychain didn't respond. Try again",
};

function keyringFailure(error: unknown, action: "read" | "delete" = "read"): unknown {
	if (!(error instanceof KeyringError)) return error;
	const why = KEYCHAIN_FAILURES[error.reason] ?? "the keychain isn't available. Try again";
	// A new login saves to a file when the keychain can't be used.
	const alternative = action === "read" ? ", or run `prismic login` again" : "";
	return new CredentialsError(`Can't ${action} your Prismic key because ${why}${alternative}.`, {
		cause: error,
	});
}

function undecryptable(): Error {
	return new CredentialsError("Your Prismic login can't be decrypted. Run `prismic login` again.");
}

// Checked right before each rename or delete, so a stalled process can't
// overwrite a newer login or restore a session after a logout.
async function assertHeld(lock: Lock): Promise<void> {
	if (await lock.isHeld()) return;
	throw new CredentialsError(
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
