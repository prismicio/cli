import * as z from "zod/mini";

import { request } from "../lib/request";

export async function refreshToken(token: string, config: { host: string }): Promise<string> {
	const { host } = config;
	const authServiceUrl = getAuthServiceUrl(host);
	const url = new URL("refreshtoken", authServiceUrl);
	url.searchParams.set("token", token);
	const refreshedToken = await request(url, { schema: z.string() });
	return refreshedToken;
}

function getAuthServiceUrl(host: string): URL {
	return new URL(`https://auth.${host}/`);
}
