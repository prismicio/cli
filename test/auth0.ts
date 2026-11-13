import { randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

// A fake Auth0 tenant for login tests. A real device login needs a person to
// approve it in a browser, so automated tests can't use Auth0 itself.

const INTERVAL = 0.1;

type FakeAuth0Response = { status: number; body?: unknown };

export type FakeAuth0 = {
	auth0Domain: string;
	clientId: string;
	requestsTo: (path: string) => Record<string, string>[];
	/** Approves the latest code. `expiresIn` sets the token's lifetime in seconds. */
	approve: (options?: { expiresIn?: number }) => void;
	deny: (options?: { description?: string }) => void;
	expire: () => void;
	respondOnce: (path: string, response: FakeAuth0Response) => void;
	/** A refresh token the server accepts, for a login a test saves itself. */
	issueRefreshToken: () => string;
	close: () => Promise<void>;
};

type DeviceCode = {
	deviceCode: string;
	expiresAt: number;
	status: "pending" | "approved" | "denied" | "redeemed";
	description?: string;
	expiresIn?: number;
};

export async function createFakeAuth0(options: { accessToken: string }): Promise<FakeAuth0> {
	const { accessToken } = options;
	const clientId = `fake-${randomToken(8)}`;
	const requests: { path: string; params: Record<string, string> }[] = [];
	const responses = new Map<string, FakeAuth0Response[]>();
	const codes: DeviceCode[] = [];
	const refreshTokens = new Set<string>();

	const server = createServer(async (req, res) => {
		const path = new URL(req.url ?? "/", "http://localhost").pathname;
		let body = "";
		for await (const chunk of req) body += chunk;
		const params = Object.fromEntries(new URLSearchParams(body));
		requests.push({ path, params });

		const response = responses.get(path)?.shift();
		if (response) {
			send(res, response.status, response.body);
			return;
		}

		if (params.client_id !== clientId) {
			return sendError(res, 401, "invalid_client", "Unknown client.");
		}

		switch (path) {
			case "/oauth/device/code": {
				const hex = randomBytes(4).toString("hex").toUpperCase();
				const userCode = `${hex.slice(0, 4)}-${hex.slice(4)}`;
				const code: DeviceCode = {
					deviceCode: randomToken(32),
					expiresAt: Date.now() + 900_000,
					status: "pending",
				};
				codes.push(code);
				const verificationUri = new URL("activate", auth0Domain);
				const verificationUriComplete = new URL(verificationUri);
				verificationUriComplete.searchParams.set("user_code", userCode);
				return send(res, 200, {
					device_code: code.deviceCode,
					user_code: userCode,
					verification_uri: verificationUri.href,
					verification_uri_complete: verificationUriComplete.href,
					expires_in: 900,
					interval: INTERVAL,
				});
			}

			case "/oauth/token": {
				if (params.grant_type === "urn:ietf:params:oauth:grant-type:device_code") {
					const code = codes.find((code) => code.deviceCode === params.device_code);
					if (!code || code.status === "redeemed") {
						return sendError(res, 403, "invalid_grant", "Invalid or expired device code.");
					}
					if (Date.now() >= code.expiresAt) {
						return sendError(res, 403, "expired_token", "The device code has expired.");
					}
					if (code.status === "denied") {
						return sendError(res, 403, "access_denied", code.description ?? "Access denied.");
					}
					if (code.status === "pending") {
						return sendError(res, 403, "authorization_pending", "Waiting for approval.");
					}
					code.status = "redeemed";
					return sendTokens(res, code.expiresIn);
				}
				if (params.grant_type === "refresh_token") {
					// Each refresh token works once. Auth0 accepts the previous one for 60
					// seconds after rotation, then revokes the whole session.
					if (!refreshTokens.delete(params.refresh_token)) {
						return sendError(res, 403, "invalid_grant", "Unknown or invalid refresh token.");
					}
					return sendTokens(res);
				}
				return sendError(res, 400, "unsupported_grant_type", "Unsupported grant type.");
			}

			case "/oauth/revoke": {
				refreshTokens.delete(params.token);
				return send(res, 200);
			}
		}

		send(res, 404);
	});

	function issueRefreshToken(): string {
		const refreshToken = randomToken(32);
		refreshTokens.add(refreshToken);
		return refreshToken;
	}

	function sendTokens(res: ServerResponse, expiresIn = 3600): void {
		send(res, 200, {
			access_token: accessToken,
			refresh_token: issueRefreshToken(),
			expires_in: expiresIn,
			token_type: "Bearer",
		});
	}

	function latestCode(): DeviceCode {
		const code = codes.at(-1);
		if (!code) throw new Error("No device code issued yet");
		return code;
	}

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	const auth0Domain = `http://127.0.0.1:${port}`;

	return {
		auth0Domain,
		clientId,
		requestsTo: (path) =>
			requests.filter((request) => request.path === path).map((request) => request.params),
		approve: ({ expiresIn } = {}) => {
			const code = latestCode();
			code.status = "approved";
			code.expiresIn = expiresIn;
		},
		deny: ({ description } = {}) => {
			const code = latestCode();
			code.status = "denied";
			code.description = description;
		},
		expire: () => {
			latestCode().expiresAt = Date.now();
		},
		respondOnce: (path, response) => {
			responses.set(path, [...(responses.get(path) ?? []), response]);
		},
		issueRefreshToken,
		close: async () => {
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
		},
	};
}

function send(res: ServerResponse, status: number, body?: unknown): void {
	if (res.destroyed) return;
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(body === undefined ? undefined : JSON.stringify(body));
}

function sendError(res: ServerResponse, status: number, error: string, description: string): void {
	send(res, status, { error, error_description: description });
}

function randomToken(bytes: number): string {
	return randomBytes(bytes).toString("base64url");
}
