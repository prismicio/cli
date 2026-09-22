import * as z from "zod/mini";

import { request } from "../../request";

export async function refreshToken(token: string, config: { host: string }): Promise<string> {
	const url = new URL("refreshtoken", `https://auth.${config.host}/`);
	url.searchParams.set("token", token);
	return request(url, { schema: z.string() });
}
