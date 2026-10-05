import * as z from "zod/mini";

import { getCredentials } from "../auth";
import { createCommand, type CommandConfig } from "../lib/command";
import { decodePayload } from "../lib/jwt";
import { getProfile } from "../lib/prismic/clients/user";

const config = {
	name: "prismic whoami",
	description: "Show the currently logged in user.",
} satisfies CommandConfig;

const WriteApiTokenSchema = z.object({
	domain: z.string().check(z.minLength(1)),
	appName: z.string().check(z.minLength(1)),
});

export default createCommand(config, async () => {
	const { token, host } = await getCredentials();
	const writeToken = readWriteApiToken(token);
	if (writeToken) {
		console.info("Write API token");
		console.info(`Repository: ${writeToken.domain}`);
		console.info(`App: ${writeToken.appName}`);
		return;
	}

	const profile = await getProfile({ token, host });
	console.info(profile.email);
});

// A Write API token has no user. GET /profile returns 403, so read the
// repository and app name from the JWT instead of calling it.
function readWriteApiToken(
	token: string | undefined,
): { domain: string; appName: string } | undefined {
	if (!token) return undefined;
	const parsed = z.safeParse(WriteApiTokenSchema, decodePayload(token));
	if (!parsed.success) return undefined;
	return parsed.data;
}
