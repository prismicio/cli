import * as z from "zod/mini";

import { request, type RequestOptions } from "../../request";

const TIMEOUT_MS = 10_000;

type Auth0Config = { auth0Domain: string; clientId: string; signal?: AbortSignal };

const DeviceCodeSchema = z.object({
	device_code: z.string(),
	user_code: z.string(),
	verification_uri: z.string(),
	verification_uri_complete: z.optional(z.string()),
	expires_in: z.number(),
	interval: z.optional(z.number()),
});
type DeviceCode = z.infer<typeof DeviceCodeSchema>;

export async function requestDeviceCode(
	params: { audience: string; scope: string },
	config: Auth0Config,
): Promise<DeviceCode> {
	const { auth0Domain, clientId } = config;
	const url = new URL("oauth/device/code", getAuth0Url(auth0Domain));
	return auth0Request(url, config, {
		method: "POST",
		body: new URLSearchParams({ client_id: clientId, ...params }),
		schema: DeviceCodeSchema,
	});
}

const DeviceTokenSchema = z.object({
	access_token: z.string(),
	refresh_token: z.string(),
	expires_in: z.number(),
});
type DeviceToken = z.infer<typeof DeviceTokenSchema>;

export async function requestDeviceToken(
	deviceCode: string,
	config: Auth0Config,
): Promise<DeviceToken> {
	const { auth0Domain, clientId } = config;
	const url = new URL("oauth/token", getAuth0Url(auth0Domain));
	return auth0Request(url, config, {
		method: "POST",
		body: new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			device_code: deviceCode,
			client_id: clientId,
		}),
		schema: DeviceTokenSchema,
	});
}

function auth0Request<T>(
	url: URL,
	config: Auth0Config,
	options: RequestOptions<T> = {},
): Promise<T> {
	const timeout = AbortSignal.timeout(TIMEOUT_MS);
	return request(url, {
		signal: config.signal ? AbortSignal.any([timeout, config.signal]) : timeout,
		...options,
	});
}

// Tests use a local server over HTTP.
function getAuth0Url(auth0Domain: string): URL {
	return new URL(/^https?:\/\//.test(auth0Domain) ? auth0Domain : `https://${auth0Domain}/`);
}
