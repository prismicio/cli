import { spawn } from "node:child_process";

import type { AsyncEntry } from "@napi-rs/keyring";

export type KeyringErrorReason =
	| "module-missing"
	| "unavailable"
	| "locked"
	| "rejected"
	| "timeout";

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

// Keychain items trust the binary that created them. With a native module,
// that's `node`, so an ad-hoc-signed Homebrew `node` prompts after each upgrade.
const macosKeyring: Keyring = {
	async get(service, account, options) {
		const args = ["find-generic-password", "-s", service, "-a", account, "-w"];
		return (await security(args, undefined, options))?.replace(/\n$/, "");
	},
	async set(service, account, password, options) {
		// On stdin, the password never shows in a process list. `security -i`
		// splits lines on spaces.
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

// `security` exits with the low byte of its status code.
const SECURITY_NOT_FOUND = 44; // errSecItemNotFound
const SECURITY_LOCKED = [36, 51]; // errSecInteractionNotAllowed, errSecAuthFailed

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
		// Never the kernel keyring, which a reboot clears.
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
