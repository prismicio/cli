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
} from "./config";
import { env } from "./env";
import { exists } from "./lib/file";
import { stringify } from "./lib/json";
import { KeyringError, systemKeyring, type KeyringErrorReason } from "./lib/keyring";
import { acquireLock, type Lock } from "./lib/lock";
import { PendingLoginSchema } from "./lib/prismic/device-flow";

const KEYCHAIN_SERVICE = "prismic-cli";
const KEYCHAIN_ACCOUNT = `cli:${createHash("sha256").update(fileURLToPath(CONFIG_DIR)).digest("hex").slice(0, 16)}`;
const KEYCHAIN_LOGIN_TIMEOUT_MS = 5_000;
// Leaves time to answer the keychain's unlock dialog.
const KEYCHAIN_TIMEOUT_MS = 30_000;

// credentials.enc starts with this byte, then a 12-byte nonce and a 16-byte
// tag, then the ciphertext.
const ENCRYPTED_FORMAT = Buffer.from([1]);

const FALLBACK_REASONS: Record<KeyringErrorReason, Exclude<FallbackReason, "forced">> = {
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

// Without a version, credentials.json has only `host` (website generator) or
// is version 1, `{ token, host }`.
const CredentialsVersionSchema = z.looseObject({
	version: z.optional(z.unknown()),
	store: z.optional(z.unknown()),
});
const LegacyCredentialsSchema = z.looseObject({
	host: z.optional(z.string()),
	token: z.optional(z.string()),
});

export type StoreMode = "keyring" | "file";

export type FallbackReason =
	| "forced"
	| "wsl"
	| "secret-service-missing"
	| "locked"
	| "write-rejected"
	| "timeout"
	| "module-missing";

export type StoredCredentials = {
	host?: string;
	legacyToken?: string;
	login?: { store: StoreMode; session: Session };
};

let key: Buffer | undefined;
let warnedUnsafe = false;

// A login that exists but can't be read throws, never reads as logged out.
export async function readCredentials(): Promise<StoredCredentials> {
	const json = parseJson(await readPrivateFile(CREDENTIALS_PATH));
	const file = z.safeParse(CredentialsVersionSchema, json);
	if (!file.success) return {};
	const { version, store } = file.data;

	if (version === undefined) {
		const legacy = z.safeParse(LegacyCredentialsSchema, json);
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
			: parseJson(decrypt(await readPrivateFile(ENCRYPTED_CREDENTIALS_PATH), await requireKey())),
	);
	if (!session.success) throw undecryptable();
	return { host: session.data.host, login: { store, session: session.data } };
}

// Only a login calls this, under the lock it keeps until it writes, so `auto`
// falls back to a file only at login.
export async function prepareLogin(): Promise<
	{ store: "keyring" } | { store: "file"; reason: FallbackReason; warning?: string }
> {
	const setting = env.PRISMIC_CREDENTIALS_STORE || "auto";
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
		warning: `No usable keychain (${FALLBACK_DESCRIPTIONS[reason]}). Saved your login in ${fileURLToPath(CREDENTIALS_PATH)}, readable only by you.`,
	});

	if (setting === "auto" && process.platform === "linux" && /microsoft/i.test(release())) {
		return fallback("wsl");
	}

	try {
		// Another process may have deleted the key since this one read it.
		key = undefined;
		if (!(await readKey(KEYCHAIN_LOGIN_TIMEOUT_MS))) {
			const newKey = randomBytes(32);
			await systemKeyring.set(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, newKey.toString("base64"), {
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
}

export async function writeCredentials(
	lock: Lock,
	login: { store: StoreMode; session: Session },
): Promise<{ warning?: string }> {
	const { store, session } = login;
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
			[CREDENTIALS_PATH, stringify({ version: 2, store, ...session })],
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
	const host = z.safeParse(LegacyCredentialsSchema, json).data?.host;
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

export async function lockCredentials(config: { timeoutMs: number }): Promise<Lock> {
	await ensurePrivateDir();
	return acquireLock(CREDENTIALS_LOCK_PATH, config);
}

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
