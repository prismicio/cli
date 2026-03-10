import { readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import * as z from "zod/mini";

import { refreshToken as baseRefreshToken } from "../clients/auth";
import { env } from "../env";
import { exists } from "./file";
import { stringify } from "./json";
import { appendTrailingSlash } from "./url";

const AUTH_FILE_PATH = new URL(".prismic", appendTrailingSlash(pathToFileURL(homedir())));
const LOGIN_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const PREFERRED_PORT = 5555;
const LOGIN_SOURCE = "prismic-cli";

const AuthFileSchema = z.object({
	token: z.optional(z.string().check(z.minLength(1))),
	host: z.optional(z.string().check(z.minLength(1))),
});
type AuthFile = z.infer<typeof AuthFileSchema>;

export async function getToken(): Promise<string | undefined> {
	const auth = await readAuthFile();
	return auth?.token;
}

export async function getHost(): Promise<string | undefined> {
	const auth = await readAuthFile();
	return auth?.host;
}

export async function refreshToken(): Promise<string | undefined> {
	const auth = await readAuthFile();
	const token = auth?.token;
	const host = auth?.host;
	if (!token) return;
	const newToken = await baseRefreshToken(token, { host });
	await saveAuthFile({ token: newToken, host });
	return newToken;
}

export async function logout(): Promise<boolean> {
	const authFileExists = await exists(AUTH_FILE_PATH);
	if (!authFileExists) return true;

	try {
		await rm(AUTH_FILE_PATH, { force: true });
		return true;
	} catch {
		return false;
	}
}

async function readAuthFile(): Promise<AuthFile | undefined> {
	try {
		const contents = await readFile(AUTH_FILE_PATH, "utf-8");
		const json = JSON.parse(contents);
		return z.parse(AuthFileSchema, json);
	} catch {
		return undefined;
	}
}

async function saveAuthFile(auth: AuthFile): Promise<void> {
	await writeFile(AUTH_FILE_PATH, stringify(auth));
}

export async function createLoginSession(options?: {
	onReady?: (url: URL) => void;
}): Promise<{ email: string }> {
	const host = env.PRISMIC_HOST;
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

						await saveAuthFile({ token, host });

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
