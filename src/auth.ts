import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as z from "zod/mini";

import { CREDENTIALS_PATH } from "./config";
import {
	lockCredentials,
	readCredentials as readStoredCredentials,
	writeCredentials,
	type Session,
	type StoredLogin,
} from "./credentials";
import { DEFAULT_PRISMIC_HOST, env } from "./env";
import { type Auth0Config, DeviceFlowError, refreshAccessToken } from "./lib/auth0";
import { exists, readJsonFile, writeFileRecursive } from "./lib/file";
import { stringify } from "./lib/json";
import type { Lock } from "./lib/lock";
import {
	refreshToken as baseRefreshToken,
	getUserProfile,
	validateToken,
} from "./lib/prismic/client";
import { ForbiddenRequestError, UnauthorizedRequestError } from "./lib/request";
import { appendTrailingSlash } from "./lib/url";
import { forgetTrackedUser } from "./tracking";

const LOGIN_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 minutes
const PREFERRED_PORT = 5555;
const LOGIN_SOURCE = "prismic-cli";
const CREDENTIALS_LOCK_TIMEOUT_MS = 30_000;

const CredentialsSchema = z.looseObject({
	token: z.optional(z.string().check(z.minLength(1))),
	host: z.optional(z.string().check(z.minLength(1))),
});
type Credentials = z.infer<typeof CredentialsSchema>;

export async function getToken(): Promise<string | undefined> {
	return env.PRISMIC_TOKEN || (await readCredentials())?.token;
}

export async function getHost(): Promise<string> {
	return env.PRISMIC_HOST || (await readCredentials())?.host || DEFAULT_PRISMIC_HOST;
}

// Native client IDs are public.
export function getAuth0Config(host: string): Auth0Config | undefined {
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
export type SessionToken =
	| { status: "active"; token: string }
	| { status: "none" }
	| { status: "ended" };

let renewal: Promise<SessionToken> | undefined;

// `forceRefresh` renews a token that a server refused, even if it's not about
// to expire.
export async function getSessionToken(
	options: { forceRefresh?: boolean } = {},
): Promise<SessionToken> {
	const { forceRefresh = false } = options;
	const session = (await readStoredCredentials()).login?.session;
	if (!session?.refreshToken) return { status: "none" };

	const freshToken = getUnexpiredToken(session, REFRESH_MARGIN_MS);
	if (freshToken && !forceRefresh) return { status: "active", token: freshToken };

	// Parallel calls share one renewal.
	renewal ??= renewSession(session.accessToken).finally(() => (renewal = undefined));
	try {
		return await renewal;
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
		const { login: storedLogin } = await readStoredCredentials();
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
	const latest = (await readStoredCredentials()).login;
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

export async function refreshToken(): Promise<string | undefined> {
	if (env.PRISMIC_TOKEN) return;
	const token = await getToken();
	if (!token) return;
	const host = await getHost();
	const newToken = await baseRefreshToken(token, { host });
	await saveCredentials({ token: newToken, host });
	return newToken;
}

let login: Promise<unknown> | undefined;

export async function onUnauthorized<T>(
	retry: (init?: Pick<RequestInit, "headers">) => Promise<T>,
): Promise<T | undefined> {
	if (env.PRISMIC_TOKEN || process.env.CI) return;
	if (!login && !(await isTokenRejected())) return;
	login ??= createLoginSession({
		onReady: (url) => console.error(`Your login is missing or expired. Log in to continue: ${url}`),
	}).finally(() => {
		login = undefined;
	});
	await login;
	return retry({ headers: { Authorization: `Bearer ${await getToken()}` } });
}

async function isTokenRejected(): Promise<boolean> {
	try {
		await validateToken(await getToken(), { host: await getHost() });
		return false;
	} catch (error) {
		return error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError;
	}
}

export async function logout(): Promise<boolean> {
	const credentialsExist = await exists(CREDENTIALS_PATH);
	if (!credentialsExist) return true;

	try {
		await rm(CREDENTIALS_PATH, { force: true });
		await forgetTrackedUser();
		return true;
	} catch {
		return false;
	}
}

async function readCredentials(): Promise<Credentials | undefined> {
	return readJsonFile(CREDENTIALS_PATH, { schema: CredentialsSchema }).catch(() => undefined);
}

async function saveCredentials(credentials: Credentials): Promise<void> {
	await writeFileRecursive(CREDENTIALS_PATH, stringify(credentials));
}

export async function createLoginSession(options: {
	onReady: (url: URL) => void;
}): Promise<{ email: string }> {
	const host = await getHost();
	const corsOrigin = `https://${host}`;

	return new Promise((resolve, reject) => {
		const server = createServer((req, res) => {
			if (req.method === "OPTIONS") {
				res.writeHead(204, {
					"Access-Control-Allow-Origin": corsOrigin,
					"Access-Control-Allow-Methods": "POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
				});
				res.end();
				return;
			}

			if (req.method === "POST") {
				const respond = (status: number, body: unknown): void => {
					res.writeHead(status, {
						"Access-Control-Allow-Origin": corsOrigin,
						"Content-Type": "application/json",
					});
					res.end(JSON.stringify(body));
				};

				let body = "";

				req.on("data", (chunk) => {
					body += chunk.toString();
				});

				req.on("end", async () => {
					try {
						const { cookies, email } = JSON.parse(body);

						const cookie: string | undefined = cookies.find((c: string) =>
							c.startsWith("prismic-auth="),
						);
						const token = cookie?.split(";")[0]?.replace(/^prismic-auth=/, "");

						if (!token) {
							respond(400, { error: "Invalid request" });
							return;
						}

						await saveCredentials({ token, host });
						await forgetTrackedUser();

						respond(200, { success: true });

						clearTimeout(timeoutId);
						server.close();
						resolve({ email });
					} catch {
						respond(400, { error: "Invalid request" });
					}
				});

				return;
			}

			res.writeHead(404);
			res.end();
		});

		const timeoutId = setTimeout(() => {
			server.close();
			reject(new Error("Login timed out. Please try again."));
		}, LOGIN_TIMEOUT_MS);

		const onListening = async (): Promise<void> => {
			const address = server.address();
			if (!address || typeof address === "string") {
				clearTimeout(timeoutId);
				server.close();
				reject(new Error("Failed to start login server"));
				return;
			}

			const url = await buildLoginUrl(host, address.port);
			options.onReady(url);
		};

		server.on("error", (error: NodeJS.ErrnoException) => {
			if (error.code === "EADDRINUSE" && server.listening === false) {
				server.listen(0, "0.0.0.0");
			} else {
				clearTimeout(timeoutId);
				reject(error);
			}
		});

		server.once("listening", onListening);
		server.listen(PREFERRED_PORT, "0.0.0.0");
	});
}

// The profile request also creates the Prismic user for a new social or SSO
// signup, so it runs right after a login saves its tokens.
export async function finishLogin(config: {
	token: string;
	host: string;
}): Promise<{ email: string }> {
	await forgetTrackedUser();
	const profile = await getUserProfile({ getToken: async () => config.token, host: config.host });
	return { email: profile.email };
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

async function buildLoginUrl(host: string, port: number): Promise<URL> {
	const url = new URL("dashboard/cli/login", `https://${host}/`);
	url.searchParams.set("source", LOGIN_SOURCE);
	url.searchParams.set("port", port.toString());
	return url;
}

export function spawnTokenRefresh(): void {
	try {
		const script = fileURLToPath(new URL("./subprocesses/refreshToken.mjs", import.meta.url));
		const child = spawn(process.execPath, [script], { detached: true, stdio: "ignore" });
		child.unref();
	} catch {
		// Silent failure — never breaks the CLI.
	}
}
