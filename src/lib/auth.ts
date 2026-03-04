import { access, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

import { appendTrailingSlash, getAuthUrl } from "./url";

const AUTH_FILE_PATH = new URL(
	".prismic",
	appendTrailingSlash(pathToFileURL(homedir())),
);
const DEFAULT_HOST = "https://prismic.io";
const LOGIN_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const PREFERRED_PORT = 5555;

type AuthContents = {
	token?: string;
	base?: string;
};

export async function saveToken(
	token: string,
	options?: { base?: string },
): Promise<void> {
	const contents: AuthContents = { token, base: options?.base };
	await writeFile(AUTH_FILE_PATH, JSON.stringify(contents, null, 2));
}

export async function isAuthenticated(): Promise<boolean> {
	const auth = await readAuthFile();
	const token = auth?.token;
	if (!token) return false;

	try {
		const authUrl = await getAuthUrl();
		const url = new URL("authentication/refreshAuthToken", authUrl);

		const response = await fetch(url, {
			method: "POST",
			headers: {
				Cookie: `prismic-auth=${token}`,
			},
		});

		if (!response.ok) {
			await removeToken();
			return false;
		}

		const newToken = parsePrismicAuthCookie(response);
		if (newToken && newToken !== token) {
			await saveToken(newToken, { base: auth.base });
		}

		return true;
	} catch {
		return false;
	}
}

export async function readToken(): Promise<string | undefined> {
	const auth = await readAuthFile();
	return auth?.token;
}

export async function readHost(): Promise<URL> {
	try {
		const auth = await readAuthFile();
		if (!auth?.base) return new URL(DEFAULT_HOST);
		return new URL(auth.base);
	} catch {
		return new URL(DEFAULT_HOST);
	}
}

export async function createLoginSession(
	options?: { onReady?: (url: URL) => void },
): Promise<{ email: string }> {
	const host = await readHost();
	const corsOrigin = host.origin;

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
				let body = "";

				req.on("data", (chunk) => {
					body += chunk.toString();
				});

				req.on("end", async () => {
					try {
						const { cookies, email } = JSON.parse(body);

						const cookie: string | undefined = cookies.find(
							(c: string) => c.startsWith("prismic-auth="),
						);
						const token = cookie
							?.split(";")[0]
							?.replace(/^prismic-auth=/, "");

						if (!token) {
							res.writeHead(400, {
								"Access-Control-Allow-Origin": corsOrigin,
								"Content-Type": "application/json",
							});
							res.end(JSON.stringify({ error: "Invalid request" }));
							return;
						}

						await saveToken(token);

						res.writeHead(200, {
							"Access-Control-Allow-Origin": corsOrigin,
							"Content-Type": "application/json",
						});
						res.end(JSON.stringify({ success: true }));

						clearTimeout(timeoutId);
						server.close();
						resolve({ email });
					} catch {
						res.writeHead(400, {
							"Access-Control-Allow-Origin": corsOrigin,
							"Content-Type": "application/json",
						});
						res.end(JSON.stringify({ error: "Invalid request" }));
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

		const onListening = (): void => {
			const address = server.address();
			if (!address || typeof address === "string") {
				clearTimeout(timeoutId);
				server.close();
				reject(new Error("Failed to start login server"));
				return;
			}

			const url = buildLoginUrl(host, address.port);
			options?.onReady?.(url);
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

function buildLoginUrl(host: URL, port: number): URL {
	const url = new URL("/dashboard/cli/login", host);
	url.searchParams.set("source", "prismic-cli");
	url.searchParams.set("port", port.toString());
	return url;
}

async function readAuthFile(): Promise<AuthContents | undefined> {
	try {
		const contents = await readFile(AUTH_FILE_PATH, "utf-8");
		return JSON.parse(contents);
	} catch {
		return undefined;
	}
}

export async function removeToken(): Promise<boolean> {
	try {
		await access(AUTH_FILE_PATH);
	} catch {
		return true;
	}

	const auth = await readAuthFile();
	if (!auth) return false;
	await rm(AUTH_FILE_PATH);
	return true;
}

function parsePrismicAuthCookie(response: Response): string | undefined {
	const setCookies = response.headers.getSetCookie();
	for (const cookie of setCookies) {
		if (cookie.startsWith("prismic-auth=")) {
			return cookie.split("=", 2)[1]?.split(";")[0];
		}
	}
	return undefined;
}
