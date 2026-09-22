import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as z from "zod/mini";

import { CREDENTIALS_PATH } from "./config";
import { DEFAULT_PRISMIC_HOST, env } from "./env";
import { exists, readJsonFile, writeFileRecursive } from "./lib/file";
import { stringify } from "./lib/json";
import { refreshToken as baseRefreshToken } from "./lib/prismic/clients/auth";
import { appendTrailingSlash } from "./lib/url";
import { forgetTrackedUser } from "./tracking";

const LOGIN_TIMEOUT_MS = 3 * 60 * 1000;

const CredentialsSchema = z.looseObject({
	token: z.optional(z.string().check(z.minLength(1))),
	host: z.optional(z.string().check(z.minLength(1))),
});

export async function getCredentials(): Promise<{ token: string | undefined; host: string }> {
	const credentials = await readJsonFile(CREDENTIALS_PATH, { schema: CredentialsSchema }).catch(
		() => undefined,
	);
	return {
		token: env.PRISMIC_TOKEN || credentials?.token,
		host: env.PRISMIC_HOST || credentials?.host || DEFAULT_PRISMIC_HOST,
	};
}

export async function refreshToken(): Promise<string | undefined> {
	if (env.PRISMIC_TOKEN) return;
	const { token, host } = await getCredentials();
	if (!token) return;
	const newToken = await baseRefreshToken(token, { host });
	await saveCredentials(newToken, host);
	return newToken;
}

export async function logout(): Promise<boolean> {
	if (!(await exists(CREDENTIALS_PATH))) return true;
	try {
		await rm(CREDENTIALS_PATH, { force: true });
		await forgetTrackedUser();
		return true;
	} catch {
		return false;
	}
}

async function saveCredentials(token: string, host: string): Promise<void> {
	await writeFileRecursive(CREDENTIALS_PATH, stringify({ token, host }));
}

export async function createLoginSession(options: {
	onReady: (url: URL) => void;
}): Promise<{ email: string }> {
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

			if (req.method !== "POST") {
				res.writeHead(404);
				res.end();
				return;
			}

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

					await saveCredentials(token, host);
					await forgetTrackedUser();
					respond(200, { success: true });

					clearTimeout(timeoutId);
					server.close();
					resolve({ email });
				} catch {
					respond(400, { error: "Invalid request" });
				}
			});
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

			const url = new URL("dashboard/cli/login", `https://${host}/`);
			url.searchParams.set("source", "prismic-cli");
			url.searchParams.set("port", address.port.toString());
			options.onReady(url);
		};

		server.on("error", (error: NodeJS.ErrnoException) => {
			if (error.code === "EADDRINUSE" && !server.listening) {
				server.listen(0, "0.0.0.0", onListening);
			} else {
				clearTimeout(timeoutId);
				reject(error);
			}
		});

		server.listen(5555, "0.0.0.0", onListening);
	});
}

// Only remove ~/.prismic when it holds the legacy CLI's update-check state.
export async function cleanupLegacyAuthFile(): Promise<void> {
	const path = new URL(".prismic", appendTrailingSlash(pathToFileURL(homedir())));
	try {
		const json = JSON.parse(await readFile(path, "utf-8"));
		if (json?.latestKnownVersion === undefined && json?.lastUpdateCheckAt === undefined) return;
		await rm(path, { force: true });
	} catch {}
}

export function spawnTokenRefresh(): void {
	try {
		const script = fileURLToPath(new URL("./subprocesses/refreshToken.mjs", import.meta.url));
		spawn(process.execPath, [script], { detached: true, stdio: "ignore" }).unref();
	} catch {}
}
