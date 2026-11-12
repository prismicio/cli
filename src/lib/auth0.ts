import { setTimeout as sleep } from "node:timers/promises";

import * as z from "zod/mini";

import { request, RequestError } from "./request";

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_INTERVAL_MS = 5_000;
const SLOW_DOWN_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;

export type Auth0Config = { auth0Domain: string; clientId: string };

export const PendingLoginSchema = z.object({
	auth0Domain: z.string(),
	clientId: z.string(),
	deviceCode: z.string(),
	userCode: z.string(),
	verificationUri: z.string(),
	verificationUriComplete: z.optional(z.string()),
	expiresAt: z.number(),
	intervalMs: z.number(),
});
export type PendingLogin = z.infer<typeof PendingLoginSchema>;

type DeviceLoginTokens = {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
};

const DeviceCodeSchema = z.object({
	device_code: z.string(),
	user_code: z.string(),
	verification_uri: z.string(),
	verification_uri_complete: z.optional(z.string()),
	expires_in: z.number(),
	interval: z.optional(z.number()),
});

export async function startDeviceLogin(
	params: { audience: string; scope: string },
	config: Auth0Config,
): Promise<PendingLogin> {
	const url = new URL("oauth/device/code", getAuth0Url(config.auth0Domain));
	const response = await request(url, {
		method: "POST",
		body: new URLSearchParams({ client_id: config.clientId, ...params }),
		signal: getRequestSignal(),
		schema: DeviceCodeSchema,
	}).catch((error) => {
		const reason = getFailureReason(error) ?? (isTransient(error) ? "unavailable" : undefined);
		throw reason ? new DeviceFlowError(reason, error) : error;
	});
	return {
		auth0Domain: config.auth0Domain,
		clientId: config.clientId,
		deviceCode: response.device_code,
		userCode: response.user_code,
		verificationUri: response.verification_uri,
		verificationUriComplete: response.verification_uri_complete,
		expiresAt: Date.now() + response.expires_in * 1000,
		intervalMs: response.interval !== undefined ? response.interval * 1000 : DEFAULT_INTERVAL_MS,
	};
}

export function getDeviceLoginPrompt(pending: PendingLogin): {
	url: string;
	userCode: string;
	codeInUrl: boolean;
} {
	return {
		url: pending.verificationUriComplete ?? pending.verificationUri,
		userCode: pending.userCode,
		codeInUrl: pending.verificationUriComplete !== undefined,
	};
}

const DeviceTokenSchema = z.object({
	access_token: z.string(),
	refresh_token: z.string(),
	expires_in: z.number(),
});

// Polls before waiting, so a resumed login that was already approved
// completes at once.
export async function pollDeviceLogin(
	pending: PendingLogin,
	options: {
		signal?: AbortSignal;
		onUpdate?: (pending: PendingLogin) => void | Promise<void>;
	} = {},
): Promise<DeviceLoginTokens> {
	const { signal, onUpdate } = options;
	let current = pending;
	let delayMs = current.intervalMs;

	while (true) {
		if (Date.now() >= current.expiresAt) throw new DeviceFlowError("expired");

		try {
			const url = new URL("oauth/token", getAuth0Url(current.auth0Domain));
			const tokens = await request(url, {
				method: "POST",
				body: new URLSearchParams({
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code: current.deviceCode,
					client_id: current.clientId,
				}),
				signal: getRequestSignal(signal),
				schema: DeviceTokenSchema,
			});
			return {
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				expiresAt: Date.now() + tokens.expires_in * 1000,
			};
		} catch (error) {
			signal?.throwIfAborted();
			const retryAfterMs = getRetryAfterMs(error);
			const code = getOAuthError(error)?.error;
			if (code === "authorization_pending") {
				delayMs = Math.max(current.intervalMs, retryAfterMs);
			} else if (code === "slow_down") {
				current = { ...current, intervalMs: current.intervalMs + SLOW_DOWN_MS };
				await onUpdate?.(current);
				delayMs = Math.max(current.intervalMs, retryAfterMs);
			} else {
				const reason = getFailureReason(error);
				if (reason) throw new DeviceFlowError(reason, error);
				if (!isTransient(error)) throw error;
				const backoffMs = Math.min(MAX_BACKOFF_MS, Math.max(delayMs, 1000) * 2);
				delayMs = Math.max(current.intervalMs, backoffMs, retryAfterMs);
			}
		}

		const waitMs = Math.min(delayMs, current.expiresAt - Date.now());
		if (waitMs > 0) {
			await sleep(waitMs, undefined, { signal }).catch(() => signal?.throwIfAborted());
		}
	}
}

// Auth0 rotates refresh tokens, but OAuth lets a server keep the same one.
const RefreshedTokenSchema = z.object({
	access_token: z.string(),
	refresh_token: z.optional(z.string()),
	expires_in: z.number(),
});

// Returns nothing when Auth0 refuses the refresh token, since the session has
// ended.
export async function refreshAccessToken(
	refreshToken: string,
	config: Auth0Config,
): Promise<DeviceLoginTokens | undefined> {
	const url = new URL("oauth/token", getAuth0Url(config.auth0Domain));
	const tokens = await request(url, {
		method: "POST",
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: config.clientId,
		}),
		signal: getRequestSignal(),
		schema: RefreshedTokenSchema,
	}).catch((error) => {
		if (getOAuthError(error)?.error === "invalid_grant") return undefined;
		throw new DeviceFlowError(isTransient(error) ? "unavailable" : "misconfigured", error);
	});
	if (!tokens) return;
	return {
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token ?? refreshToken,
		expiresAt: Date.now() + tokens.expires_in * 1000,
	};
}

function getRequestSignal(signal?: AbortSignal): AbortSignal {
	const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
	return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

// Tests use a local server over HTTP.
function getAuth0Url(auth0Domain: string): URL {
	return new URL(/^https?:\/\//.test(auth0Domain) ? auth0Domain : `https://${auth0Domain}/`);
}

function getFailureReason(error: unknown): DeviceFlowErrorReason | undefined {
	if (error instanceof RequestError) {
		const oauthError = getOAuthError(error);
		switch (oauthError?.error) {
			case "expired_token":
				return "expired";
			case "access_denied":
				return oauthError?.error_description === "email_verification_failed"
					? "email-unverified"
					: "declined";
			case "invalid_grant":
				return "invalid-grant";
		}
		return isTransient(error) ? undefined : "misconfigured";
	}
	if (error instanceof z.core.$ZodError) return "misconfigured";
}

function isTransient(error: unknown): boolean {
	if (error instanceof RequestError) return error.status === 429 || error.status >= 500;
	// fetch throws a TypeError on network errors.
	return (
		error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError")
	);
}

const OAuthErrorSchema = z.object({
	error: z.string(),
	error_description: z.optional(z.string()),
});

// Auth0 sends OAuth errors with several statuses, such as `slow_down` as a 429.
function getOAuthError(error: unknown) {
	if (error instanceof RequestError) return z.safeParse(OAuthErrorSchema, error.body).data;
}

// Retry-After is a number of seconds or an HTTP date.
function getRetryAfterMs(error: unknown): number {
	const value = error instanceof RequestError ? error.response.headers.get("Retry-After") : null;
	if (!value) return 0;
	const seconds = Number(value);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
	const date = Date.parse(value);
	if (Number.isFinite(date)) return Math.max(0, date - Date.now());
	return 0;
}

type DeviceFlowErrorReason =
	| "expired"
	| "declined"
	| "email-unverified"
	| "invalid-grant"
	| "misconfigured"
	| "unavailable";

// `error` isn't kept as `cause`, since Sentry reports causes and they can hold
// response details. `detail` is the Auth0 error code or HTTP status.
export class DeviceFlowError extends Error {
	name = "DeviceFlowError";
	reason: DeviceFlowErrorReason;
	detail: string | undefined;

	constructor(reason: DeviceFlowErrorReason, error?: unknown) {
		const detail = error === undefined ? undefined : getDetail(error);
		super(getMessage(reason, detail));
		this.reason = reason;
		this.detail = detail;
	}
}

function getMessage(reason: DeviceFlowErrorReason, detail: string | undefined): string {
	switch (reason) {
		case "expired":
			return "The device code expired.";
		case "declined":
			return "The login was declined.";
		case "email-unverified":
			return "The login was declined because the email address isn't verified.";
		case "invalid-grant":
			return "The device code is unknown or was already used.";
		case "misconfigured":
			return `Auth0 rejected the request (${detail}).`;
		case "unavailable":
			return `Auth0 can't be reached (${detail}).`;
	}
}

function getDetail(error: unknown): string {
	if (error instanceof RequestError) return getOAuthError(error)?.error ?? `HTTP ${error.status}`;
	if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
	if (error instanceof TypeError) return "network error";
	return "unexpected response";
}
