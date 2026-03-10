import * as v from "valibot";

import { env } from "../lib/env";
import { request } from "../lib/request";

export async function validateToken(
	token: string,
	config: { host: string | undefined },
): Promise<boolean> {
	const { host } = config;
	const authServiceUrl = getAuthServiceUrl(host);
	const url = new URL("validate", authServiceUrl);
	url.searchParams.set("token", token);
	try {
		await request(url);
		return true;
	} catch {
		return false;
	}
}

export async function refreshToken(
	token: string,
	config: { host: string | undefined },
): Promise<string> {
	const { host } = config;
	const authServiceUrl = getAuthServiceUrl(host);
	const url = new URL("refreshtoken", authServiceUrl);
	url.searchParams.set("token", token);
	const refreshedToken = await request(url, { schema: v.string() });
	return refreshedToken;
}

function getAuthServiceUrl(host = env.PRISMIC_HOST): URL {
	return new URL(`https://auth.${host}/`);
}
