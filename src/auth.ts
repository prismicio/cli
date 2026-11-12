import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import {
	CredentialsError,
	lockLogin,
	prepareLogin,
	readCredentials,
	readLoginSummary,
	withCredentialsLock,
	writeCredentials,
	type Session,
	type StoredLogin,
} from "./credentials";
import { DEFAULT_PRISMIC_HOST, env } from "./env";
import { detectAgent } from "./lib/ai";
import {
	type Auth0Config,
	type DeviceLoginTokens,
	DeviceFlowError,
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

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
// Below Claude Code's 2-minute command timeout.
const AGENT_WAIT_MS = (process.env.PROD === "false" && env.PRISMIC_AGENT_WAIT_MS) || 90_000;
// Auth0's device codes expire after 15 minutes.
const LOGIN_WAIT_MS = 15 * 60 * 1000;
const PENDING_POLL_MS = 250;
const LOGIN_PARAMS = { audience: "prismic.io", scope: "openid profile email offline_access" };
const LEGACY_AUTH_FILE_PATH = new URL(".prismic", appendTrailingSlash(pathToFileURL(homedir())));

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
	// Whether this command waited for another command's login, and that
	// command's code once this one showed it.
	waited: boolean;
	shown?: PendingLogin;
	// Set once this command is the one that polls Auth0.
	pending?: PendingLogin;
};

type SavedLogin = Pick<StoredLogin, "store" | "storeReason"> & { token: string };
type LoginOutcome =
	| ({ status: "logged-in"; email: string } & SavedLogin)
	| { status: "wait-limit" }
	| { status: "logged-out" };

type StartedLogin =
	| { status: "pending"; pending: PendingLogin }
	| ({ status: "saved" } & SavedLogin)
	| { status: "logged-out" };

let renewal: Promise<string | undefined> | undefined;
// Auth0 ended the saved session in this process, so the login prompt can say
// why.
let ended = false;

let reauthentication: Promise<string> | undefined;

export async function getToken(): Promise<string | undefined> {
	return env.PRISMIC_TOKEN || getSessionToken();
}

export async function getHost(): Promise<string> {
	if (env.PRISMIC_HOST) return env.PRISMIC_HOST;
	return (await readLoginSummary()).host || DEFAULT_PRISMIC_HOST;
}

// `forceRefresh` renews a token that a server refused, even if it's not about
// to expire. Returns nothing without a session.
async function getSessionToken(
	options: { forceRefresh?: boolean } = {},
): Promise<string | undefined> {
	const { forceRefresh = false } = options;
	const session = (await readCredentials()).login?.session;
	if (!session?.refreshToken) return;

	const freshToken = getUnexpiredToken(session, REFRESH_MARGIN_MS);
	if (freshToken && !forceRefresh) return freshToken;

	// Parallel calls share one renewal.
	renewal ??= withCredentialsLock(async (lock) => {
		const { login } = await readCredentials();
		return renewLogin(lock, login, session.accessToken, { canRetry: true });
	}).finally(() => (renewal = undefined));
	try {
		return await renewal;
	} catch (error) {
		// Without Auth0 or the saved login, the current token works until it
		// expires, unless a server already refused it.
		const token = getUnexpiredToken(session);
		const isRenewalError = error instanceof DeviceFlowError || error instanceof CredentialsError;
		if (isRenewalError && token && !forceRefresh) return token;
		throw error;
	}
}

async function renewLogin(
	lock: Lock,
	storedLogin: StoredLogin | undefined,
	staleToken: string | undefined,
	options: { canRetry: boolean },
): Promise<string | undefined> {
	const session = storedLogin?.session;
	if (!storedLogin || !session?.refreshToken) return;

	// Another process renewed it while this one waited for the lock.
	const freshToken = getUnexpiredToken(session, REFRESH_MARGIN_MS);
	if (freshToken && freshToken !== staleToken) return freshToken;

	const { refreshToken, auth0Domain, clientId, host } = session;
	const tokens = await refreshAccessToken(refreshToken, session);
	if (tokens) {
		await writeCredentials(lock, { ...storedLogin, session: { ...session, ...tokens } });
		return tokens.accessToken;
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
	ended = true;
}

function getUnexpiredToken(session: Session, marginMs = 0): string | undefined {
	const { accessToken, expiresAt } = session;
	if (accessToken && expiresAt && expiresAt - marginMs > Date.now()) return accessToken;
}

export async function onUnauthorized<T>(
	retry: (init?: Pick<RequestInit, "headers">) => Promise<T>,
	sent: Headers,
): Promise<T | undefined> {
	if (env.PRISMIC_TOKEN || process.env.CI) return;
	// A parallel request may have renewed the token since this one was sent.
	const current = await getToken();
	if (current && sent.get("Authorization") !== `Bearer ${current}`) {
		return retry({ headers: { Authorization: `Bearer ${current}` } });
	}
	if (!reauthentication && !(await isTokenRejected())) return;
	reauthentication ??= reauthenticate().finally(() => (reauthentication = undefined));
	const token = await reauthentication;
	return retry({ headers: { Authorization: `Bearer ${token}` } });
}

async function isTokenRejected(): Promise<boolean> {
	try {
		await validateToken(await getToken(), { host: await getHost() });
		return false;
	} catch (error) {
		return error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError;
	}
}

// A refused token gets one refresh. A login starts only when the session is
// over, never when Auth0 can't be reached.
export async function reauthenticate(options: { browser?: boolean } = {}): Promise<string> {
	const token = await getSessionToken({ forceRefresh: true });
	if (token) return token;
	console.error(ended ? "Your login expired." : "You are not logged in.");
	return logIn(options);
}

// The prompt and the result go to stderr, so a command that logs in on its own
// keeps its output clean.
export async function logIn(options: { browser?: boolean } = {}): Promise<string> {
	const { browser = false } = options;
	const host = await getHost();
	const auth0 = getAuth0Config(host);
	if (!auth0) throw new CommandError(`Login isn't available for ${host}. Use PRISMIC_TOKEN.`);

	// An agent stops before its command times out, then runs the command again
	// to continue. Without a terminal, nobody may be there to approve, so it
	// stops the same way.
	const isPerson =
		detectAgent() === undefined && process.stdin.isTTY === true && process.stderr.isTTY === true;
	const login: Login = {
		host,
		auth0,
		deadline: isPerson ? Infinity : Date.now() + AGENT_WAIT_MS,
		startedAt: Date.now(),
		resumed: false,
		waited: false,
		tokenBefore: (await readCredentials().catch(() => undefined))?.login?.session.accessToken,
	};

	// Ctrl-C during a login runs only this handler, so a command that stops on
	// Ctrl-C, like sync, can't exit before the login cleans up.
	const handlers = process.rawListeners("SIGINT") as NodeJS.SignalsListener[];
	process.removeAllListeners("SIGINT");
	process.once("SIGINT", async () => {
		console.error();
		if (login.pending) await setPendingLogin(login.pending, undefined);
		recordLogin({ result: "cancelled", resumed: login.resumed, startedAt: login.startedAt });
		await endCommand("Login cancelled.", 130);
	});

	let outcome: LoginOutcome;
	try {
		outcome = await completeLogin(login, { browser: browser && isPerson });
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
	if (outcome.status === "wait-limit") {
		recordLogin({ result: "wait-limit", resumed, startedAt });
		return endCommand(
			"Waiting for approval. After the user approves, run the same command again. It continues this login.",
			1,
		);
	}
	if (outcome.status === "logged-out") {
		recordLogin({ result: "cancelled", resumed, startedAt });
		throw new CommandError("A logout cancelled this login. Run the command again to log in.");
	}
	const { token, email, store, storeReason } = outcome;
	// A command that only waited for another command's login doesn't count it.
	if (login.pending) recordLogin({ result: "success", resumed, startedAt, store, storeReason });
	console.error(`Logged in to Prismic as ${email}`);
	return token;
}

// Native client IDs are public.
function getAuth0Config(host: string): Auth0Config | undefined {
	// Tests log in with a fake Auth0 server. In a release, a stray variable must
	// never send a real login to another tenant.
	if (process.env.PROD === "false" && env.PRISMIC_AUTH0_DOMAIN) {
		return { auth0Domain: env.PRISMIC_AUTH0_DOMAIN, clientId: env.PRISMIC_AUTH0_CLIENT_ID ?? "" };
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

// Ends the command at once, even inside a request whose errors the command
// catches, like sync's loop.
async function endCommand(message: string, exitCode: number): Promise<never> {
	process.exitCode = exitCode;
	trackCommandEnd({ error: message });
	// Exiting right after a write can drop it from a pipe.
	await new Promise((resolve) => process.stderr.write(`${message}\n`, resolve));
	process.exit();
}

async function completeLogin(login: Login, options: { browser: boolean }): Promise<LoginOutcome> {
	const loginLock = await lockLoginAfterOthers(login);
	if (!loginLock) return { status: "wait-limit" };

	let saved: SavedLogin;
	try {
		const started = await startLogin(login);
		if (started.status === "logged-out") return started;
		if (started.status === "saved") {
			saved = started;
		} else {
			const { pending } = started;
			if (pending.deviceCode !== login.shown?.deviceCode) printLoginPrompt(pending);
			const url = new URL(pending.verificationUriComplete ?? pending.verificationUri);
			// openBrowser() runs a shell, so the URL from Auth0 must hold no shell syntax.
			if (options.browser && url.protocol === "https:" && /^[\w\-.:/?=&%~+]+$/.test(url.href)) {
				openBrowser(url);
			}
			const tokens = await pollUntilApproved(login, pending);
			if ("status" in tokens) return tokens;
			const stored = await saveLogin(login, pending, tokens);
			if (!stored) return { status: "logged-out" };
			saved = stored;
		}
	} finally {
		await loginLock.release();
	}

	// The profile request also creates the Prismic user for a new social or SSO
	// signup, so it runs right after a login saves its tokens.
	await forgetTrackedUser();
	const { email } = await getUserProfile({ getToken: async () => saved.token, host: login.host });
	return { ...saved, status: "logged-in", email };
}

// One command polls Auth0 per config directory. Another command that needs a
// login shows the same code and waits for the first one, as long as its own
// login would. Returns nothing when an agent's wait ends first.
async function lockLoginAfterOthers(login: Login): Promise<Lock | undefined> {
	const waitUntil = Math.min(login.deadline, Date.now() + LOGIN_WAIT_MS);
	while (true) {
		// Until the other command saves its code, look for it between tries.
		const timeoutMs = login.shown ? waitUntil - Date.now() : 0;
		try {
			return await lockLogin({ timeoutMs });
		} catch (error) {
			if (!(error instanceof LockTimeoutError)) throw error;
			if (Date.now() >= login.deadline) return;
			// The other command's code expired by now.
			if (Date.now() >= waitUntil) throw new DeviceFlowError("expired");
		}

		login.waited = true;
		const session = (await readCredentials().catch(() => undefined))?.login?.session;
		login.shown = session && getResumableLogin(session, login);
		if (login.shown) printLoginPrompt(login.shown);
		else await sleep(PENDING_POLL_MS);
	}
}

// A new code is saved, so a later run can continue it. The login gets its code
// while the lock is held, so a Ctrl-C right after still finds it to delete.
async function startLogin(login: Login): Promise<StartedLogin> {
	return withCredentialsLock(async (lock) => {
		// A saved login that can't be read doesn't stop a new one.
		const credentials = await readCredentials().catch(() => undefined);
		// A failed login keeps the saved login, but a logout deletes it.
		if (login.shown && credentials && !credentials.login) return { status: "logged-out" };
		const stored = credentials?.login;
		const resumable = stored && getResumableLogin(stored.session, login);
		if (resumable) {
			login.pending = resumable;
			login.startedAt = resumable.startedAt;
			login.resumed = true;
			return { status: "pending", pending: resumable };
		}
		const current = stored?.session.host === login.host ? stored : undefined;
		const token = current && getUnexpiredToken(current.session);
		if (login.waited && token && token !== login.tokenBefore) {
			return { status: "saved", token, store: current.store, storeReason: current.storeReason };
		}

		const pending = { ...(await startDeviceLogin(LOGIN_PARAMS, login.auth0)), host: login.host };
		login.pending = pending;
		login.startedAt = pending.startedAt;
		const store = await prepareLogin(lock);
		// The current session works until the new login replaces it, even on
		// another host.
		const session = stored?.session ?? { host: login.host, ...login.auth0 };
		await writeCredentials(lock, { ...store, session: { ...session, pendingLogin: pending } });
		return { status: "pending", pending };
	});
}

// A pending login is bound to its host, Auth0 domain and client ID, and its
// expiry never moves.
function getResumableLogin(session: Session, login: Login): PendingLogin | undefined {
	const { pendingLogin } = session;
	if (
		pendingLogin &&
		pendingLogin.host === login.host &&
		pendingLogin.auth0Domain === login.auth0.auth0Domain &&
		pendingLogin.clientId === login.auth0.clientId &&
		pendingLogin.expiresAt > Date.now()
	) {
		return pendingLogin;
	}
}

function printLoginPrompt(pending: PendingLogin): void {
	const { userCode, verificationUri, verificationUriComplete } = pending;
	const minutes = Math.max(1, Math.ceil((pending.expiresAt - Date.now()) / 60_000));
	console.error(dedent`
		Open this URL on any device to log in:
		  ${verificationUriComplete ?? verificationUri}
		${verificationUriComplete !== undefined ? `Check that the page shows the code ${userCode}.` : `Enter the code ${userCode}.`}
		Waiting for the login (the code expires in ${minutes} ${minutes === 1 ? "minute" : "minutes"})...
	`);
}

// Stops early when an agent's wait ends, which keeps the pending login for the
// next run, or when a logout deletes the pending login.
async function pollUntilApproved(
	login: Login,
	pending: PendingLogin,
): Promise<DeviceLoginTokens | { status: "wait-limit" | "logged-out" }> {
	const loggedOut = new AbortController();
	const watcher = setInterval(async () => {
		const stored = await readCredentials().catch(() => undefined);
		if (stored && stored.login?.session.pendingLogin?.deviceCode !== pending.deviceCode) {
			loggedOut.abort();
		}
	}, PENDING_POLL_MS);
	const deadline = Number.isFinite(login.deadline)
		? AbortSignal.timeout(Math.max(0, login.deadline - Date.now()))
		: undefined;
	try {
		return await pollDeviceLogin(pending, {
			signal: deadline ? AbortSignal.any([deadline, loggedOut.signal]) : loggedOut.signal,
			onUpdate: (next) => setPendingLogin(pending, { ...next, host: login.host }),
		});
	} catch (error) {
		if (error instanceof DeviceFlowError) {
			// The code can't be used anymore.
			await setPendingLogin(pending, undefined);
			throw error;
		}
		if (loggedOut.signal.aborted) return { status: "logged-out" };
		if (deadline?.aborted) return { status: "wait-limit" };
		throw error;
	} finally {
		clearInterval(watcher);
	}
}

// Best effort. Leaves the saved pending login alone if another command
// replaced it.
async function setPendingLogin(
	current: PendingLogin,
	next: Session["pendingLogin"],
): Promise<void> {
	await withCredentialsLock(async (lock) => {
		const stored = (await readCredentials()).login;
		if (stored?.session.pendingLogin?.deviceCode !== current.deviceCode) return;
		await writeCredentials(lock, { ...stored, session: { ...stored.session, pendingLogin: next } });
	}).catch(() => {});
}

// Returns nothing when a logout deleted the pending login while it waited.
async function saveLogin(
	login: Login,
	pending: PendingLogin,
	tokens: DeviceLoginTokens,
): Promise<SavedLogin | undefined> {
	return withCredentialsLock(async (lock) => {
		// A saved login that can't be read can't have been logged out.
		const stored = await readCredentials().catch(() => undefined);
		if (stored && stored.login?.session.pendingLogin?.deviceCode !== pending.deviceCode) {
			await revokeRefreshToken(tokens.refreshToken, pending).catch(() => {});
			return;
		}

		// Without a logout, the key that saved the pending login is still valid,
		// and reading it again could fall back to a file if the keychain locked
		// during the wait.
		const store = stored?.login
			? { store: stored.login.store, storeReason: stored.login.storeReason }
			: await prepareLogin(lock);
		const session = { host: login.host, ...login.auth0, ...tokens };
		await writeCredentials(lock, { ...store, session });
		// The new login is saved first, so a failed revoke only leaves the
		// previous session to expire.
		const previous = stored?.login?.session;
		if (previous?.refreshToken) {
			await revokeRefreshToken(previous.refreshToken, previous).catch(() => {});
		}
		return { ...store, token: tokens.accessToken };
	});
}

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
