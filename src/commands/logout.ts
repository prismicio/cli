import {
	clearCredentials,
	CredentialsError,
	readCredentials,
	readLoginSummary,
	withCredentialsLock,
} from "../credentials";
import { env } from "../env";
import { DeviceFlowError, revokeRefreshToken } from "../lib/auth0";
import { createCommand, type CommandConfig } from "../lib/command";
import { forgetTrackedUser, recordLogout } from "../tracking";

const config = {
	name: "prismic logout",
	description: "Log out of Prismic.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const { guest } = await readLoginSummary();
	let revoked = false;
	await withCredentialsLock(async (lock) => {
		try {
			const session = (await readCredentials()).login?.session;
			if (session?.refreshToken) {
				await revokeRefreshToken(session.refreshToken, session);
				revoked = true;
			}
		} catch (error) {
			if (!(error instanceof CredentialsError || error instanceof DeviceFlowError)) throw error;
			console.warn(
				`Couldn't revoke your session because ${getProblem(error)}. It stays valid until it expires.`,
			);
		}
		await clearCredentials(lock);
		await forgetTrackedUser();
	});
	recordLogout({ revoked });
	if (guest) {
		console.warn(
			`You were logged in to a temporary account, and the CLI can't log back in to it. Claim it before ${new Date(guest.expiresAt).toUTCString()} to keep its repositories: ${guest.claimUrl}`,
		);
	}
	if (env.PRISMIC_TOKEN) console.warn("PRISMIC_TOKEN is still set, so commands still use it.");
	console.info("Logged out of Prismic");
});

function getProblem(error: CredentialsError | DeviceFlowError): string {
	if (error instanceof CredentialsError) return "the saved login can't be read";
	return error.reason === "unavailable"
		? "the Prismic login service can't be reached"
		: `the Prismic login service answered ${error.detail}`;
}
