import {
	clearCredentials,
	CredentialsError,
	type CredentialsErrorReason,
	lockCredentials,
	readCredentials,
} from "../credentials";
import { env } from "../env";
import { DeviceFlowError, revokeRefreshToken } from "../lib/auth0";
import { createCommand, type CommandConfig } from "../lib/command";
import { forgetTrackedUser, recordLogout } from "../tracking";

const KEYCHAIN_PROBLEMS: Partial<Record<CredentialsErrorReason, string>> = {
	locked: "the keychain is locked",
	timeout: "the keychain didn't respond",
	"keychain-unavailable": "the keychain isn't available",
};

const config = {
	name: "prismic logout",
	description: "Log out of Prismic.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	let revoked = false;
	const lock = await lockCredentials();
	try {
		try {
			const session = (await readCredentials()).login?.session;
			if (session?.refreshToken) {
				const { refreshToken, auth0Domain, clientId } = session;
				await revokeRefreshToken(refreshToken, { auth0Domain, clientId });
				revoked = true;
			}
		} catch (error) {
			if (!(error instanceof CredentialsError || error instanceof DeviceFlowError)) throw error;
			console.warn(
				`Couldn't revoke your session because ${getProblem(error)}. It stays valid until it expires.`,
			);
		}
		await clearCredentials(lock).catch((error) => {
			if (!(error instanceof CredentialsError && error.reason in KEYCHAIN_PROBLEMS)) throw error;
			console.warn(error.message);
		});
		await forgetTrackedUser();
	} finally {
		await lock.release();
	}
	recordLogout({ revoked });
	if (env.PRISMIC_TOKEN) console.warn("PRISMIC_TOKEN is still set, so commands still use it.");
	console.info("Logged out of Prismic");
});

function getProblem(error: CredentialsError | DeviceFlowError): string {
	if (error instanceof CredentialsError) {
		return KEYCHAIN_PROBLEMS[error.reason] ?? "the saved login can't be read";
	}
	return error.reason === "unavailable"
		? "the login service can't be reached"
		: `the login service answered ${error.detail}`;
}
