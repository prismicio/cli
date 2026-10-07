import * as z from "zod/mini";

import { request } from "../../request";

type AuthConfig = { host: string };

export async function refreshToken(token: string, config: AuthConfig): Promise<string> {
	const url = new URL("refreshtoken", getAuthServiceUrl(config.host));
	url.searchParams.set("token", token);
	return request(url, { schema: z.string() });
}

const SessionSchema = z.union([
	z.object({ type: z.literal("USER"), email: z.string(), shortId: z.string() }),
	z.object({ type: z.literal("Machine2Machine"), domain: z.string(), appName: z.string() }),
]);
export type Session = z.infer<typeof SessionSchema>;

export async function validateToken(
	token: string | undefined,
	config: AuthConfig,
): Promise<Session> {
	const url = new URL("validate", getAuthServiceUrl(config.host));
	url.searchParams.set("token", token ?? "");
	return request(url, { schema: SessionSchema });
}

function getAuthServiceUrl(host: string): URL {
	return new URL(`https://auth.${host}/`);
}
