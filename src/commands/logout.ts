import { formatGuest, hasGuestEnded, setGuestAside } from "../auth";
import {
	clearCredentials,
	CredentialsError,
	readCredentials,
	type Session,
	withCredentialsLock,
	writeCredentials,
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
	// A claimed temporary account isn't worth keeping.
	await hasGuestEnded().catch(() => {});
	let kept: Session["guest"];
	let revoked = false;
	await withCredentialsLock(async (lock) => {
		let login;
		try {
			({ login } = await readCredentials());
			const session = login?.session;
			// A temporary account keeps its token, so the CLI can pick it up again.
			if (session?.refreshToken && !session.guest) {
				await revokeRefreshToken(session.refreshToken, session);
				revoked = true;
			}
		} catch (error) {
			if (!(error instanceof CredentialsError || error instanceof DeviceFlowError)) throw error;
			console.warn(
				`Couldn't revoke your session because ${getProblem(error)}. It stays valid until it expires.`,
			);
		}
		const savedGuest = login && setGuestAside(login.session);
		if (login && savedGuest) {
			// Its client ID tells `init` and `repo create` to pick it up again.
			const { host, auth0Domain } = login.session;
			const { clientId } = savedGuest;
			await writeCredentials(lock, {
				...login,
				session: { host, auth0Domain, clientId, savedGuest },
			});
			kept = login.session.guest;
		} else {
			await clearCredentials(lock);
		}
		await forgetTrackedUser();
	});
	recordLogout({ revoked });
	if (kept) console.warn(formatGuest(kept, "Your temporary account stays on this machine"));
	if (env.PRISMIC_TOKEN) console.warn("PRISMIC_TOKEN is still set, so commands still use it.");
	console.info("Logged out of Prismic");
});

function getProblem(error: CredentialsError | DeviceFlowError): string {
	if (error instanceof CredentialsError) return "the saved login can't be read";
	return error.reason === "unavailable"
		? "the Prismic login service can't be reached"
		: `the Prismic login service answered ${error.detail}`;
}
