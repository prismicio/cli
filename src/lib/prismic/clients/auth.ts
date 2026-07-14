import * as z from "zod/mini";

import { request } from "../../request";

type AuthConfig = { host: string };

export async function refreshToken(token: string, config: AuthConfig): Promise<string> {
	const url = new URL("refreshtoken", getAuthServiceUrl(config.host));
	url.searchParams.set("token", token);
	return request(url, { schema: z.string() });
}

function getAuthServiceUrl(host: string): URL {
	return new URL(`https://auth.${host}/`);
}
