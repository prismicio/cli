import { getHost, getToken } from "../auth";
import {
	deleteOAuthAuthorization,
	deleteWriteToken,
	getOAuthApps,
	getWriteTokens,
} from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic token delete",
	description: `
		Delete a token from a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		token: { description: "Token value", required: true },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [tokenValue] = positionals;
	const { repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();

	const [apps, writeTokensInfo] = await Promise.all([
		getOAuthApps({ repo, token, host }),
		getWriteTokens({ repo, token, host }),
	]);

	// Search access tokens
	const accessTokenAuths = apps.flatMap((app) => app.wroom_auths);
	const accessToken = accessTokenAuths.find((auth) => auth.token === tokenValue);
	if (accessToken) {
		await deleteOAuthAuthorization(accessToken.id, { repo, token, host });
		console.info("Token deleted");
		return;
	}

	// Search write tokens
	const writeToken = writeTokensInfo.tokens.find((t) => t.token === tokenValue);
	if (writeToken) {
		await deleteWriteToken(writeToken.token, { repo, token, host });
		console.info("Token deleted");
		return;
	}

	throw new CommandError(`Token not found: ${tokenValue}`);
});
