import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import {
	deleteOAuthAuthorization,
	deleteWriteToken,
	getOAuthApps,
	getWriteTokens,
} from "../lib/prismic/client";

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
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: {
			type: "string",
			short: "e",
			description: "Alias for --repo",
			deprecated: "Use `prismic env` or --repo instead.",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [tokenValue] = positionals;
	const { env, repo = env ?? (await getActiveRepositoryName()) } = values;

	const { host, getToken } = await getCredentials();

	const [apps, writeTokensInfo] = await Promise.all([
		getOAuthApps({ repo, host, getToken }),
		getWriteTokens({ repo, host, getToken }),
	]);

	// Search access tokens
	const accessTokenAuths = apps.flatMap((app) => app.wroom_auths);
	const accessToken = accessTokenAuths.find((auth) => auth.token === tokenValue);
	if (accessToken) {
		await deleteOAuthAuthorization(accessToken.id, { repo, host, getToken });
		console.info("Token deleted");
		return;
	}

	// Search write tokens
	const writeToken = writeTokensInfo.tokens.find((t) => t.token === tokenValue);
	if (writeToken) {
		await deleteWriteToken(writeToken.token, { repo, host, getToken });
		console.info("Token deleted");
		return;
	}

	throw new CommandError(`Token not found: ${tokenValue}`);
});
