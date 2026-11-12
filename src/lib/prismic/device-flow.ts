import { setTimeout as sleep } from "node:timers/promises";

import * as z from "zod/mini";

import { RequestError } from "../request";
import { type Auth0Config, requestDeviceCode, requestDeviceToken } from "./client";

const DEFAULT_INTERVAL_MS = 5_000;
const SLOW_DOWN_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;

export const PendingLoginSchema = z.object({
	host: z.string(),
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

export function getAuth0Config(
	host: string,
	overrides: { auth0Domain?: string; clientId?: string } = {},
): Auth0Config | undefined {
	const known = getKnownAuth0Config(host);
	const auth0Domain = overrides.auth0Domain || known?.auth0Domain;
	const clientId = overrides.clientId || known?.clientId;
	if (!auth0Domain || !clientId) return undefined;
	return { auth0Domain, clientId };
}

export async function startDeviceLogin(
	config: Auth0Config & { host: string },
): Promise<PendingLogin> {
	const { host, auth0Domain, clientId } = config;
	const response = await requestDeviceCode(
		{ audience: "prismic.io", scope: "openid profile email offline_access" },
		{ auth0Domain, clientId },
	).catch((error) => {
		const reason = getFailureReason(error) ?? (isTransient(error) ? "unavailable" : undefined);
		throw reason ? new DeviceFlowError(reason, host, error) : error;
	});
	return {
		host,
		auth0Domain,
		clientId,
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
		if (Date.now() >= current.expiresAt) throw new DeviceFlowError("expired", current.host);

		try {
			const tokens = await requestDeviceToken(current.deviceCode, {
				auth0Domain: current.auth0Domain,
				clientId: current.clientId,
				signal,
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
				if (reason) throw new DeviceFlowError(reason, current.host, error);
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

// Native client IDs are public.
function getKnownAuth0Config(host: string): Auth0Config | undefined {
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
// response details.
export class DeviceFlowError extends Error {
	name = "DeviceFlowError";
	reason: DeviceFlowErrorReason;

	constructor(reason: DeviceFlowErrorReason, host: string, error?: unknown) {
		super(getMessage(reason, host, error));
		this.reason = reason;
	}
}

function getMessage(reason: DeviceFlowErrorReason, host: string, error: unknown): string {
	switch (reason) {
		case "expired":
			return "The login code expired. Run the command again.";
		case "declined":
			return "The login was declined in the browser.";
		case "email-unverified":
			return "Prismic sent you an email to verify your address. Verify it, then run the command again.";
		case "invalid-grant":
			return "The login code is no longer valid. Run the command again.";
		case "misconfigured":
			return `Login isn't set up correctly for ${host} (${getDetail(error)}). Report this.`;
		case "unavailable":
			return `Can't reach the login service for ${host} (${getDetail(error)}). Try again in a few minutes.`;
	}
}

function getDetail(error: unknown): string {
	if (error instanceof RequestError) return getOAuthError(error)?.error ?? `HTTP ${error.status}`;
	if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
	if (error instanceof TypeError) return "network error";
	return "unexpected response";
}
