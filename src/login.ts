import { exec } from "node:child_process";
import { createServer } from "node:http";
import { parseArgs } from "node:util";

import { saveToken } from "./lib/auth";

const LOGIN_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

const HELP = `
Log in to Prismic via browser.

USAGE
  prismic login [flags]

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic <command> --help\` for more information about a command.
`.trim();

export async function login(): Promise<void> {
	const { values } = parseArgs({
		args: process.argv.slice(3),
		options: { help: { type: "boolean", short: "h" } },
	});

	if (values.help) {
		console.info(HELP);
		return;
	}

	return new Promise((resolve, reject) => {
		const server = createServer((req, res) => {
			// Handle CORS preflight
			if (req.method === "OPTIONS") {
				res.writeHead(204, {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
				});
				res.end();
				return;
			}

			// Handle POST with credentials
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
								"Access-Control-Allow-Origin": "*",
								"Content-Type": "application/json",
							});
							res.end(JSON.stringify({ error: "Invalid request" }));
							return;
						}

						await saveToken(token);

						console.info(`Logged in to Prismic as ${email}`);

						res.writeHead(200, {
							"Access-Control-Allow-Origin": "*",
							"Content-Type": "application/json",
						});
						res.end(JSON.stringify({ success: true }));

						clearTimeout(timeoutId);
						server.close();
						resolve();
					} catch {
						res.writeHead(400, {
							"Access-Control-Allow-Origin": "*",
							"Content-Type": "application/json",
						});
						res.end(JSON.stringify({ error: "Invalid request" }));
					}
				});

				return;
			}

			// Handle other requests
			res.writeHead(404);
			res.end();
		});

		const timeoutId = setTimeout(() => {
			server.close();
			reject(new Error("Login timed out. Please try again."));
		}, LOGIN_TIMEOUT_MS);

		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				clearTimeout(timeoutId);
				server.close();
				reject(new Error("Failed to start login server"));
				return;
			}

			const port = address.port;
			const loginUrl = buildLoginUrl(port);

			console.info(`Opening browser to complete login...`);
			console.info(`If the browser doesn't open, visit: ${loginUrl}`);

			openBrowser(loginUrl);
		});

		server.on("error", (error) => {
			clearTimeout(timeoutId);
			reject(error);
		});
	});
}

function buildLoginUrl(port: number): URL {
	const url = new URL(`https://prismic.io/dashboard/cli/login`);
	url.searchParams.set("source", "slice-machine");
	url.searchParams.set("port", port.toString());
	return url;
}

function openBrowser(url: URL): void {
	const cmd =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	exec(`${cmd} "${url.toString()}"`);
}
