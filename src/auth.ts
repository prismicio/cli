import { readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import * as z from "zod/mini";

import { refreshToken as baseRefreshToken } from "./clients/auth";
import { DEFAULT_PRISMIC_HOST, env } from "./env";
import { getConfigDir } from "./lib/config-dir";
import { exists, writeFileRecursive } from "./lib/file";
import { stringify } from "./lib/json";

const CONFIG_DIR = getConfigDir("prismic", env.PRISMIC_CONFIG_DIR);

export const CREDENTIALS_PATH = new URL("credentials.json", CONFIG_DIR);
export const UPDATE_NOTIFIER_STATE_PATH = new URL("update-notifier.json", CONFIG_DIR);

const LOGIN_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const PREFERRED_PORT = 5555;
const LOGIN_SOURCE = "prismic-cli";

const CredentialsSchema = z.looseObject({
	token: z.optional(z.string().check(z.minLength(1))),
	host: z.optional(z.string().check(z.minLength(1))),
});
type Credentials = z.infer<typeof CredentialsSchema>;

export async function getToken(): Promise<string | undefined> {
	const credentials = await readCredentials();
	return credentials?.token;
}

export async function getHost(): Promise<string> {
	if (env.PRISMIC_HOST) return env.PRISMIC_HOST;
	const credentials = await readCredentials();
	return credentials?.host || DEFAULT_PRISMIC_HOST;
}

export async function refreshToken(): Promise<string | undefined> {
	const token = await getToken();
	if (!token) return;
	const host = await getHost();
	const newToken = await baseRefreshToken(token, { host });
	await saveCredentials({ token: newToken, host });
	return newToken;
}

export async function logout(): Promise<boolean> {
	const credentialsExist = await exists(CREDENTIALS_PATH);
	if (!credentialsExist) return true;

	try {
		await rm(CREDENTIALS_PATH, { force: true });
		return true;
	} catch {
		return false;
	}
}

async function readCredentials(): Promise<Credentials | undefined> {
	try {
		const contents = await readFile(CREDENTIALS_PATH, "utf-8");
		const json = JSON.parse(contents);
		return z.parse(CredentialsSchema, json);
	} catch {
		return undefined;
	}
}

async function saveCredentials(credentials: Credentials): Promise<void> {
	await writeFileRecursive(CREDENTIALS_PATH, stringify(credentials));
}

export async function createLoginSession(options?: {
	onReady?: (url: URL) => void;
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
							res.writeHead(400, {
								"Access-Control-Allow-Origin": corsOrigin,
								"Content-Type": "application/json",
							});
							res.end(JSON.stringify({ error: "Invalid request" }));
							return;
						}

						await saveCredentials({ token, host });

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

		const onListening = async (): Promise<void> => {
			const address = server.address();
			if (!address || typeof address === "string") {
				clearTimeout(timeoutId);
				server.close();
				reject(new Error("Failed to start login server"));
				return;
			}

			const url = await buildLoginUrl(host, address.port);
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

async function buildLoginUrl(host: string, port: number): Promise<URL> {
	const url = new URL("dashboard/cli/login", `https://${host}/`);
	url.searchParams.set("source", LOGIN_SOURCE);
	url.searchParams.set("port", port.toString());
	return url;
}
