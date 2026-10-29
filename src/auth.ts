import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as z from "zod/mini";

import { CREDENTIALS_PATH } from "./config";
import { DEFAULT_PRISMIC_HOST, env } from "./env";
import { openBrowser } from "./lib/browser";
import { CommandError } from "./lib/command";
import { exists, readJsonFile, writeFileRecursive } from "./lib/file";
import { stringify } from "./lib/json";
import { type Credentials, refreshToken as baseRefreshToken } from "./lib/prismic/client";
import { appendTrailingSlash } from "./lib/url";
import { forgetTrackedUser } from "./tracking";

const LOGIN_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const PREFERRED_PORT = 5555;
const LOGIN_SOURCE = "prismic-cli";

const CredentialsSchema = z.looseObject({
	token: z.optional(z.string().check(z.minLength(1))),
	host: z.optional(z.string().check(z.minLength(1))),
});
type StoredCredentials = z.infer<typeof CredentialsSchema>;

// When a request finds the token missing or invalid, it can ask for a new
// token with `getToken({ login: true })`. That starts a login that prints its
// URL. A command that wants the browser login calls `logIn` itself.
export async function getCredentials(options: { allowLogin?: boolean } = {}): Promise<Credentials> {
	const { allowLogin = true } = options;
	const stored = await readCredentials();
	let token = env.PRISMIC_TOKEN || stored?.token;
	const canLogIn = allowLogin && !env.PRISMIC_TOKEN && !env.CI;
	return {
		host: env.PRISMIC_HOST || stored?.host || DEFAULT_PRISMIC_HOST,
		getToken: async ({ login } = {}) => {
			if (!login) return token;
			if (!canLogIn) return undefined;
			token = await logInOnce(token);
			return token;
		},
	};
}

export async function logIn(options: { openBrowser?: boolean } = {}): Promise<string> {
	const { email, token } = await createLoginSession({
		onReady: (url) => {
			if (options.openBrowser) {
				console.info("Opening browser to complete login...");
				console.info(`If the browser doesn't open, visit: ${url}`);
				openBrowser(url);
			} else {
				console.info(`Open this URL to log in: ${url}`);
			}
		},
	});
	console.info(`Logged in to Prismic as ${email}`);
	return token;
}

let pendingLogin: Promise<string> | undefined;

// Parallel requests that find an invalid token share one login.
function logInOnce(invalidToken: string | undefined): Promise<string> {
	if (!pendingLogin) {
		console.info(invalidToken ? "Your login expired." : "You are not logged in.");
		pendingLogin = logIn().finally(() => (pendingLogin = undefined));
	}
	return pendingLogin;
}

export async function refreshToken(): Promise<string | undefined> {
	if (env.PRISMIC_TOKEN) return;
	const { host, getToken } = await getCredentials({ allowLogin: false });
	const token = await getToken();
	if (!token) return;
	const newToken = await baseRefreshToken(token, { host });
	await saveCredentials({ token: newToken, host });
	return newToken;
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

async function readCredentials(): Promise<StoredCredentials | undefined> {
	return readJsonFile(CREDENTIALS_PATH, { schema: CredentialsSchema }).catch(() => undefined);
}

async function saveCredentials(credentials: StoredCredentials): Promise<void> {
	await writeFileRecursive(CREDENTIALS_PATH, stringify(credentials));
}

async function createLoginSession(options: {
	onReady: (url: URL) => void;
}): Promise<{ email: string; token: string }> {
	const { host } = await getCredentials();
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
						resolve({ email, token });
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
			reject(new CommandError("Login timed out. Please try again."));
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
				server.listen(0, "0.0.0.0", onListening);
			} else {
				clearTimeout(timeoutId);
				reject(error);
			}
		});

		server.listen(PREFERRED_PORT, "0.0.0.0", onListening);
	});
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
