import { spawn } from "node:child_process";

import type { AsyncEntry } from "@napi-rs/keyring";

// macOS uses `/usr/bin/security`. A native module's keychain items trust the
// `node` binary that created them, so an ad-hoc-signed `node` (Homebrew) shows
// a keychain prompt after every upgrade. Items created by `security` trust
// `security`. Other platforms use `@napi-rs/keyring`.

export type KeyringErrorReason =
	| "module-missing" // The native module failed to load.
	| "unavailable" // No keychain service, such as Linux without Secret Service.
	| "locked" // The keychain is locked and can't be unlocked here.
	| "rejected" // The keychain refused the operation.
	| "timeout"; // The keychain didn't answer in time.

export class KeyringError extends Error {
	name = "KeyringError";
	reason: KeyringErrorReason;

	constructor(reason: KeyringErrorReason, options?: ErrorOptions) {
		super(`Keychain error: ${reason}`, options);
		this.reason = reason;
	}
}

type Options = { timeoutMs: number };

export type Keyring = {
	get(service: string, account: string, options: Options): Promise<string | undefined>;
	set(service: string, account: string, password: string, options: Options): Promise<void>;
	delete(service: string, account: string, options: Options): Promise<boolean>;
};

const macosKeyring: Keyring = {
	async get(service, account, options) {
		const args = ["find-generic-password", "-s", service, "-a", account, "-w"];
		return (await security(args, undefined, options))?.replace(/\n$/, "");
	},
	async set(service, account, password, options) {
		// The password goes on stdin, so it never appears in a process list.
		// `security -i` splits lines on spaces, so values can't contain them.
		if (![service, account, password].every((value) => /^[^\s"'\\]+$/.test(value))) {
			throw new TypeError("Keychain values can't contain spaces, quotes or backslashes.");
		}
		const command = `add-generic-password -U -s ${service} -a ${account} -w ${password}\n`;
		await security(["-i"], command, options);
	},
	async delete(service, account, options) {
		const args = ["delete-generic-password", "-s", service, "-a", account];
		return (await security(args, undefined, options)) !== undefined;
	},
};

// `security` exits with the low byte of the Security framework's status code.
const SECURITY_NOT_FOUND = 44; // errSecItemNotFound
const SECURITY_LOCKED = [
	36, // errSecInteractionNotAllowed: locked, and no session to unlock it in.
	51, // errSecAuthFailed: wrong keychain password.
];

// Resolves with the output, or undefined when the item doesn't exist.
function security(
	args: string[],
	input: string | undefined,
	options: Options,
): Promise<string | undefined> {
	return new Promise((resolve, reject) => {
		const child = spawn("/usr/bin/security", args, {
			signal: AbortSignal.timeout(options.timeoutMs),
			stdio: ["pipe", "pipe", "ignore"],
		});
		let stdout = "";
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
		child.on("error", (error) => {
			const reason = error.name === "AbortError" ? "timeout" : "unavailable";
			reject(new KeyringError(reason, { cause: error }));
		});
		child.on("close", (code) => {
			if (code === 0) resolve(stdout);
			else if (code === SECURITY_NOT_FOUND) resolve(undefined);
			else reject(new KeyringError(SECURITY_LOCKED.includes(code ?? 0) ? "locked" : "rejected"));
		});
		child.stdin.end(input);
	});
}

const napiKeyring: Keyring = {
	get: (service, account, options) =>
		napiCall(service, account, options, async (entry, signal) => {
			return (await entry.getPassword(signal)) ?? undefined;
		}),
	set: (service, account, password, options) =>
		napiCall(service, account, options, (entry, signal) => entry.setPassword(password, signal)),
	delete: (service, account, options) =>
		napiCall(service, account, options, (entry, signal) => entry.deleteCredential(signal)),
};

async function napiCall<T>(
	service: string,
	account: string,
	options: Options,
	call: (entry: AsyncEntry, signal: AbortSignal) => Promise<T>,
): Promise<T> {
	let Entry: typeof AsyncEntry;
	try {
		({ AsyncEntry: Entry } = await import("@napi-rs/keyring"));
	} catch (cause) {
		throw new KeyringError("module-missing", { cause });
	}

	const signal = AbortSignal.timeout(options.timeoutMs);
	try {
		// Linux must use Secret Service. The kernel keyring lives in memory and
		// is cleared on reboot. The constructor throws when Secret Service is
		// missing.
		const entry = new Entry(service, account, { linux: { store: "secret-service" } });
		return await call(entry, signal);
	} catch (cause) {
		if (signal.aborted) throw new KeyringError("timeout", { cause });
		const message = cause instanceof Error ? cause.message : "";
		if (/locked/i.test(message)) throw new KeyringError("locked", { cause });
		throw new KeyringError(process.platform === "linux" ? "unavailable" : "rejected", { cause });
	}
}

export const systemKeyring: Keyring = process.platform === "darwin" ? macosKeyring : napiKeyring;
