import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import {
	clearCredentials,
	CredentialsError,
	lockCredentials,
	lockLogin,
	prepareLogin,
	readCredentials,
	readHost,
	writeCredentials,
	type CredentialsErrorReason,
	type Session,
	type StoredLogin,
} from "./credentials";
import { DEFAULT_PRISMIC_HOST, env } from "./env";
import { detectAgent } from "./lib/ai";
import {
	type Auth0Config,
	type DeviceLoginTokens,
	DeviceFlowError,
	getDeviceLoginPrompt,
	type PendingLogin,
	pollDeviceLogin,
	refreshAccessToken,
	revokeRefreshToken,
	startDeviceLogin,
} from "./lib/auth0";
import { openBrowser } from "./lib/browser";
import { CommandError } from "./lib/command";
import { type Lock, LockTimeoutError } from "./lib/lock";
import { getUserProfile, validateToken } from "./lib/prismic/client";
import { ForbiddenRequestError, UnauthorizedRequestError } from "./lib/request";
import { dedent } from "./lib/string";
import { appendTrailingSlash } from "./lib/url";
import { forgetTrackedUser, getLoginResult, recordLogin, trackCommandEnd } from "./tracking";

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 minutes
const CREDENTIALS_LOCK_TIMEOUT_MS = 30_000;
// Below Claude Code's 2-minute command timeout.
const AGENT_WAIT_MS = 90_000;
// Auth0's device codes expire after 15 minutes.
const LOGIN_WAIT_MS = 15 * 60 * 1000;
const PENDING_POLL_MS = 250;
const LOGIN_PARAMS = { audience: "prismic.io", scope: "openid profile email offline_access" };

export async function getToken(): Promise<string | undefined> {
	if (env.PRISMIC_TOKEN) return env.PRISMIC_TOKEN;
	const session = await getSessionToken();
	if (session.status === "active") return session.token;
}

export async function getHost(): Promise<string> {
	return env.PRISMIC_HOST || (await readHost().catch(() => undefined)) || DEFAULT_PRISMIC_HOST;
}

// Native client IDs are public.
function getAuth0Config(host: string): Auth0Config | undefined {
	// Tests log in with a fake Auth0 server. Production builds drop this branch.
	if (process.env.PROD === "false" && process.env.PRISMIC_AUTH0_DOMAIN) {
		return {
			auth0Domain: process.env.PRISMIC_AUTH0_DOMAIN,
			clientId: process.env.PRISMIC_AUTH0_CLIENT_ID ?? "",
		};
	}
	if (host === "prismic.io") {
		return { auth0Domain: "auth0.prismic.io", clientId: "V1yuPKJOHhuHNMR4Oeo2fj5uTCfVebny" };
	}
	if (host === "wroom.io" || host === "devops-wroom.com") {
		return { auth0Domain: "auth0.wroom.io", clientId: "UKxsYw8EcAspkUPRvoFkrO1aj9cA3zkd" };
	}
	if (/^[a-z0-9-]+-wroom\.com$/.test(host)) {
		return {
			auth0Domain: "auth0.platform-wroom.com",
			clientId: "Opbx7JjftGb5sgjIWKVx0XDBSrW37say",
		};
	}
}

// "ended" means Auth0 ended the session, so the caller can say the login
// expired and start a new one.
type SessionToken = { status: "active"; token: string } | { status: "none" } | { status: "ended" };

let renewal: Promise<SessionToken> | undefined;
// A session that ended in this process stays "ended", so the login prompt can
// say why.
let ended = false;

// `forceRefresh` renews a token that a server refused, even if it's not about
// to expire.
async function getSessionToken(options: { forceRefresh?: boolean } = {}): Promise<SessionToken> {
	const { forceRefresh = false } = options;
	const session = (await readCredentials()).login?.session;
	if (!session?.refreshToken) return { status: ended ? "ended" : "none" };

	const freshToken = getUnexpiredToken(session, REFRESH_MARGIN_MS);
	if (freshToken && !forceRefresh) return { status: "active", token: freshToken };

	// Parallel calls share one renewal.
	renewal ??= renewSession(session.accessToken).finally(() => (renewal = undefined));
	try {
		const result = await renewal;
		if (result.status === "ended") ended = true;
		return result;
	} catch (error) {
		// Without Auth0, the current token works until it expires, unless a
		// server already refused it.
		const token = getUnexpiredToken(session);
		if (error instanceof DeviceFlowError && token && !forceRefresh) {
			return { status: "active", token };
		}
		throw error;
	}
}

async function renewSession(staleToken: string | undefined): Promise<SessionToken> {
	const lock = await lockCredentials({ timeoutMs: CREDENTIALS_LOCK_TIMEOUT_MS });
	try {
		const { login: storedLogin } = await readCredentials();
		return await renewLogin(lock, storedLogin, staleToken, { canRetry: true });
	} finally {
		await lock.release();
	}
}

async function renewLogin(
	lock: Lock,
	storedLogin: StoredLogin | undefined,
	staleToken: string | undefined,
	options: { canRetry: boolean },
): Promise<SessionToken> {
	const session = storedLogin?.session;
	if (!storedLogin || !session?.refreshToken) return { status: "none" };

	// Another process renewed it while this one waited for the lock.
	const freshToken = getUnexpiredToken(session, REFRESH_MARGIN_MS);
	if (freshToken && freshToken !== staleToken) return { status: "active", token: freshToken };

	const { refreshToken, auth0Domain, clientId, host } = session;
	const tokens = await refreshAccessToken(refreshToken, { auth0Domain, clientId });
	if (tokens) {
		await writeCredentials(lock, { ...storedLogin, session: { ...session, ...tokens } });
		return { status: "active", token: tokens.accessToken };
	}

	// If the refresh token changed meanwhile, retry once with it, but only while
	// holding the lock: using it without saving the result would end that
	// session.
	const latest = (await readCredentials()).login;
	if (options.canRetry && latest?.session.refreshToken !== refreshToken && (await lock.isHeld())) {
		return renewLogin(lock, latest, staleToken, { canRetry: false });
	}

	// The write fails if another process took the lock over.
	await writeCredentials(lock, {
		...storedLogin,
		session: { host, auth0Domain, clientId, pendingLogin: session.pendingLogin },
	});
	return { status: "ended" };
}

function getUnexpiredToken(session: Session, marginMs = 0): string | undefined {
	const { accessToken, expiresAt } = session;
	if (accessToken && expiresAt && expiresAt - marginMs > Date.now()) return accessToken;
}

let reauthentication: Promise<string> | undefined;

export async function onUnauthorized<T>(
	retry: (init?: Pick<RequestInit, "headers">) => Promise<T>,
): Promise<T | undefined> {
	if (env.PRISMIC_TOKEN || process.env.CI) return;
	if (!reauthentication && !(await isTokenRejected())) return;
	reauthentication ??= reauthenticate().finally(() => (reauthentication = undefined));
	const token = await reauthentication;
	return retry({ headers: { Authorization: `Bearer ${token}` } });
}

// A refused token gets one refresh. A login starts only when the session is
// over, never when Auth0 can't be reached.
export async function reauthenticate(options: { browser?: boolean } = {}): Promise<string> {
	const session = await getSessionToken({ forceRefresh: true });
	if (session.status === "active") return session.token;
	console.error(session.status === "ended" ? "Your login expired." : "You are not logged in.");
	return logIn(options);
}

async function isTokenRejected(): Promise<boolean> {
	try {
		await validateToken(await getToken(), { host: await getHost() });
		return false;
	} catch (error) {
		return error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError;
	}
}

type Login = {
	host: string;
	auth0: Auth0Config;
	// Infinity for a person, who waits until the code expires.
	deadline: number;
	startedAt: number;
	resumed: boolean;
	// The saved token when the login started. Another command's login shows
	// up as a different one.
	tokenBefore?: string;
	// Set once this command is the one that polls Auth0.
	pending?: PendingLogin;
};

type SavedLogin = Pick<StoredLogin, "store" | "storeReason"> & { token: string };
type CompletedLogin = SavedLogin & { email: string };

// The prompt and the result go to stderr, so a command that logs in on its own
// keeps its output clean.
export async function logIn(options: { browser?: boolean } = {}): Promise<string> {
	const host = await getHost();
	const auth0 = getAuth0Config(host);
	if (!auth0) throw new CommandError(`Login isn't available for ${host}. Use PRISMIC_TOKEN.`);

	// An agent stops before its command times out, then runs the command again
	// to continue.
	const isPerson = detectAgent() === undefined && process.stdin.isTTY === true;
	const login: Login = {
		host,
		auth0,
		deadline: isPerson ? Infinity : Date.now() + AGENT_WAIT_MS,
		startedAt: Date.now(),
		resumed: false,
		tokenBefore: (await readCredentials().catch(() => undefined))?.login?.session.accessToken,
	};

	// Ctrl-C during a login runs only this handler, so a command that stops on
	// Ctrl-C, like sync, can't exit before the login cleans up.
	const handlers = process.rawListeners("SIGINT") as NodeJS.SignalsListener[];
	process.removeAllListeners("SIGINT");
	process.once("SIGINT", async () => {
		console.error();
		if (login.pending) await setPendingLogin(login.pending, undefined).catch(() => {});
		recordLogin({ result: "cancelled", resumed: login.resumed, startedAt: login.startedAt });
		await endCommand("Login cancelled.", 130);
	});

	let outcome: CompletedLogin | "wait-limit" | "logged-out";
	try {
		outcome = await completeLogin(login, { browser: Boolean(options.browser) && isPerson });
	} catch (error) {
		recordLogin({
			result: getLoginResult(error),
			resumed: login.resumed,
			startedAt: login.startedAt,
		});
		throw error;
	} finally {
		process.removeAllListeners("SIGINT");
		for (const handler of handlers) process.on("SIGINT", handler);
	}

	const { resumed, startedAt } = login;
	if (outcome === "wait-limit") {
		recordLogin({ result: "wait-limit", resumed, startedAt });
		return endCommand(
			"Waiting for approval. After the user approves, run the same command again. It continues this login.",
			1,
		);
	}
	if (outcome === "logged-out") {
		recordLogin({ result: "cancelled", resumed, startedAt });
		throw new CommandError("A logout cancelled this login. Run the command again to log in.");
	}
	const { token, email, store, storeReason } = outcome;
	recordLogin({ result: "success", resumed, startedAt, store, storeReason });
	console.error(`Logged in to Prismic as ${email}`);
	return token;
}

// Ends the command at once, even inside a request whose errors the command
// catches, like sync's loop.
async function endCommand(message: string, exitCode: number): Promise<never> {
	process.exitCode = exitCode;
	trackCommandEnd({ error: message });
	// Exiting right after a write can drop it from a pipe.
	await new Promise((resolve) => process.stderr.write(`${message}\n`, resolve));
	process.exit();
}

async function completeLogin(
	login: Login,
	options: { browser: boolean },
): Promise<CompletedLogin | "wait-limit" | "logged-out"> {
	const other = await lockLoginAfterOthers(login);
	if (!other) return "wait-limit";

	let saved: SavedLogin;
	try {
		const started = await startLogin(login, other);
		if (started === "logged-out") return started;
		if ("token" in started) {
			saved = started;
		} else {
			const { pending } = started;
			if (pending.deviceCode !== other.shown?.deviceCode) printLoginPrompt(pending);
			if (options.browser) openBrowser(new URL(getDeviceLoginPrompt(pending).url));
			const tokens = await pollUntilApproved(login, pending);
			if (!tokens) return "wait-limit";
			const store = await saveLogin(login, pending, tokens);
			if (!store) return "logged-out";
			saved = { ...store, token: tokens.accessToken };
		}
	} finally {
		await other.lock.release();
	}

	// The profile request also creates the Prismic user for a new social or SSO
	// signup, so it runs right after a login saves its tokens.
	await forgetTrackedUser();
	const { email } = await getUserProfile({ getToken: async () => saved.token, host: login.host });
	return { ...saved, email };
}

type LoginLock = {
	lock: Lock;
	waited: boolean;
	// The other command's code, once this one showed it.
	shown?: PendingLogin;
};

// One command polls Auth0 per config directory. Another command that needs a
// login shows the same code and waits for the first one, as long as its own
// login would. Returns nothing when an agent's wait ends first.
async function lockLoginAfterOthers(login: Login): Promise<LoginLock | undefined> {
	const waitUntil = Math.min(login.deadline, Date.now() + LOGIN_WAIT_MS);
	const other: Omit<LoginLock, "lock"> = { waited: false };
	while (true) {
		// Until the other command saves its code, look for it between tries.
		const timeoutMs = other.shown ? waitUntil - Date.now() : 0;
		try {
			return { ...other, lock: await lockLogin({ timeoutMs }) };
		} catch (error) {
			if (!(error instanceof LockTimeoutError)) throw error;
			if (Date.now() >= login.deadline) return;
			// The other command's code expired by now.
			if (Date.now() >= waitUntil) throw new DeviceFlowError("expired");
		}

		other.waited = true;
		const session = (await readCredentials().catch(() => undefined))?.login?.session;
		other.shown = session && getResumableLogin(session, login);
		if (other.shown) printLoginPrompt(other.shown);
		else await sleep(PENDING_POLL_MS);
	}
}

// Resumes the saved login, or starts one and saves it so a later run can
// continue it. prepareLogin and that write share one lock hold. Returns the
// saved login instead when another command logged in while this one waited,
// and "logged-out" when a logout cancelled the login it waited for.
async function startLogin(
	login: Login,
	other: Omit<LoginLock, "lock">,
): Promise<{ pending: PendingLogin } | SavedLogin | "logged-out"> {
	const lock = await lockCredentials({ timeoutMs: CREDENTIALS_LOCK_TIMEOUT_MS });
	try {
		// A saved login that can't be read doesn't stop a new one.
		const credentials = await readCredentials().catch(() => undefined);
		// A failed login keeps the saved login, but a logout deletes it.
		if (other.shown && credentials && !credentials.login) return "logged-out";
		const stored = credentials?.login;
		const resumable = stored && getResumableLogin(stored.session, login);
		if (resumable) {
			Object.assign(login, { pending: resumable, startedAt: resumable.startedAt, resumed: true });
			return { pending: resumable };
		}
		const current = stored?.session.host === login.host ? stored : undefined;
		const token = current && getUnexpiredToken(current.session);
		if (other.waited && token && token !== login.tokenBefore) {
			return { token, store: current.store, storeReason: current.storeReason };
		}

		const pending = await startDeviceLogin(LOGIN_PARAMS, login.auth0);
		Object.assign(login, { pending, startedAt: pending.startedAt });
		const store = await prepareLogin(lock);
		// The current session works until the new login replaces it.
		const session = current?.session ?? { host: login.host, ...login.auth0 };
		const { warning } = await writeCredentials(lock, {
			...store,
			session: { ...session, pendingLogin: pending },
		});
		if (warning) console.warn(warning);
		return { pending };
	} finally {
		await lock.release();
	}
}

// A pending login is bound to its host, Auth0 domain and client ID, and its
// expiry never moves.
function getResumableLogin(session: Session, login: Login): PendingLogin | undefined {
	const { pendingLogin } = session;
	if (
		pendingLogin &&
		session.host === login.host &&
		pendingLogin.auth0Domain === login.auth0.auth0Domain &&
		pendingLogin.clientId === login.auth0.clientId &&
		pendingLogin.expiresAt > Date.now()
	) {
		return pendingLogin;
	}
}

function printLoginPrompt(pending: PendingLogin): void {
	const { url, userCode, codeInUrl } = getDeviceLoginPrompt(pending);
	const minutes = Math.max(1, Math.ceil((pending.expiresAt - Date.now()) / 60_000));
	console.error(dedent`
		Open this URL on any device to log in:
		  ${url}
		${codeInUrl ? `Check that the page shows the code ${userCode}.` : `Enter the code ${userCode}.`}
		Waiting for the login (the code expires in ${minutes} ${minutes === 1 ? "minute" : "minutes"})...
	`);
}

// Returns nothing when an agent's wait ends first. The pending login stays, so
// the next run continues it.
async function pollUntilApproved(
	login: Login,
	pending: PendingLogin,
): Promise<DeviceLoginTokens | undefined> {
	const signal = Number.isFinite(login.deadline)
		? AbortSignal.timeout(Math.max(0, login.deadline - Date.now()))
		: undefined;
	try {
		return await pollDeviceLogin(pending, {
			signal,
			onUpdate: (next) => setPendingLogin(pending, next).catch(() => {}),
		});
	} catch (error) {
		if (signal?.aborted) return;
		// The code can't be used anymore.
		if (error instanceof DeviceFlowError) await setPendingLogin(pending, undefined).catch(() => {});
		throw error;
	}
}

// Leaves the saved pending login alone if another command replaced it.
async function setPendingLogin(
	current: PendingLogin,
	next: PendingLogin | undefined,
): Promise<void> {
	const lock = await lockCredentials({ timeoutMs: CREDENTIALS_LOCK_TIMEOUT_MS });
	try {
		const stored = (await readCredentials()).login;
		if (stored?.session.pendingLogin?.deviceCode !== current.deviceCode) return;
		await writeCredentials(lock, { ...stored, session: { ...stored.session, pendingLogin: next } });
	} finally {
		await lock.release();
	}
}

// Returns nothing when a logout deleted the pending login while it waited.
async function saveLogin(
	login: Login,
	pending: PendingLogin,
	tokens: DeviceLoginTokens,
): Promise<Pick<StoredLogin, "store" | "storeReason"> | undefined> {
	const lock = await lockCredentials({ timeoutMs: CREDENTIALS_LOCK_TIMEOUT_MS });
	try {
		const { auth0Domain, clientId } = pending;
		// A saved login that can't be read can't have been logged out.
		const stored = await readCredentials().catch(() => undefined);
		if (stored && stored.login?.session.pendingLogin?.deviceCode !== pending.deviceCode) {
			await revokeRefreshToken(tokens.refreshToken, { auth0Domain, clientId }).catch(() => {});
			return;
		}

		// Without a logout, the key that saved the pending login is still valid,
		// and reading it again could fall back to a file if the keychain locked
		// during the wait.
		const store = stored?.login
			? { store: stored.login.store, storeReason: stored.login.storeReason }
			: await prepareLogin(lock);
		const session = { host: login.host, auth0Domain, clientId, ...tokens };
		const { warning } = await writeCredentials(lock, { ...store, session });
		if (warning) console.warn(warning);
		// The new login is saved first, so a failed revoke only leaves the
		// previous session to expire.
		const previous = stored?.login?.session;
		if (previous?.refreshToken) {
			await revokeRefreshToken(previous.refreshToken, {
				auth0Domain: previous.auth0Domain,
				clientId: previous.clientId,
			}).catch(() => {});
		}
		return store;
	} finally {
		await lock.release();
	}
}

const KEYCHAIN_PROBLEMS: Partial<Record<CredentialsErrorReason, string>> = {
	locked: "the keychain is locked",
	timeout: "the keychain didn't respond",
	"keychain-unavailable": "the keychain isn't available",
};

export async function endSession(): Promise<{ revoked: boolean; warnings: string[] }> {
	let revoked = false;
	const warnings: string[] = [];
	const lock = await lockCredentials({ timeoutMs: CREDENTIALS_LOCK_TIMEOUT_MS });
	try {
		try {
			const session = (await readCredentials()).login?.session;
			if (session?.refreshToken) {
				const { refreshToken, auth0Domain, clientId } = session;
				await revokeRefreshToken(refreshToken, { auth0Domain, clientId });
				revoked = true;
			}
		} catch (error) {
			warnings.push(
				`Couldn't revoke your session because ${getProblem(error)}. It stays valid until it expires.`,
			);
		}
		await clearCredentials(lock).catch((error) => {
			if (!(error instanceof CredentialsError && error.reason in KEYCHAIN_PROBLEMS)) throw error;
			warnings.push(`Couldn't delete your Prismic key because ${getProblem(error)}.`);
		});
		await forgetTrackedUser();
	} finally {
		await lock.release();
	}
	if (env.PRISMIC_TOKEN) warnings.push("PRISMIC_TOKEN is still set, so commands still use it.");
	return { revoked, warnings };
}

const LEGACY_AUTH_FILE_PATH = new URL(".prismic", appendTrailingSlash(pathToFileURL(homedir())));

export async function cleanupLegacyAuthFile(): Promise<void> {
	let contents: string;
	try {
		contents = await readFile(LEGACY_AUTH_FILE_PATH, "utf-8");
	} catch {
		return;
	}

	try {
		const json = JSON.parse(contents);
		if (!json || (json.latestKnownVersion === undefined && json.lastUpdateCheckAt === undefined)) {
			return;
		}
	} catch {
		return;
	}

	try {
		await rm(LEGACY_AUTH_FILE_PATH, { force: true });
	} catch {}
}

function getProblem(error: unknown): string {
	if (error instanceof CredentialsError) {
		return KEYCHAIN_PROBLEMS[error.reason] ?? "the saved login can't be read";
	}
	if (error instanceof DeviceFlowError) {
		return error.reason === "unavailable"
			? "the login service can't be reached"
			: `the login service answered ${error.detail}`;
	}
	return "of an unexpected error";
}
