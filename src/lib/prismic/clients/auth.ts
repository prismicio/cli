import * as z from "zod/mini";

import { request, UnauthorizedRequestError } from "../../request";

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

export async function validateToken(
	token: string | undefined,
	config: AuthConfig,
): Promise<z.infer<typeof SessionSchema>> {
	const url = new URL("validate", getAuthServiceUrl(config.host));
	url.searchParams.set("token", token ?? "");
	return request(url, { schema: SessionSchema });
}

const InvalidAuthContextSchema = z.object({ error: z.literal("invalid_auth_context") });

// The credential is valid, but the route needs a user, e.g. a Write API token on an admin route.
export function isInvalidAuthContextError(error: unknown): boolean {
	return (
		error instanceof UnauthorizedRequestError &&
		z.safeParse(InvalidAuthContextSchema, error.body).success
	);
}

function getAuthServiceUrl(host: string): URL {
	return new URL(`https://auth.${host}/`);
}
