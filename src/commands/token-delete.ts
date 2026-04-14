import { getHost, getToken } from "../auth";
import {
	deleteOAuthAuthorization,
	deleteWriteToken,
	getOAuthApps,
	getWriteTokens,
} from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
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

	let apps;
	let writeTokensInfo;
	try {
		[apps, writeTokensInfo] = await Promise.all([
			getOAuthApps({ repo, token, host }),
			getWriteTokens({ repo, token, host }),
		]);
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to delete token: ${message}`);
		}
		throw error;
	}

	// Search access tokens
	const accessTokenAuths = apps.flatMap((app) => app.wroom_auths);
	const accessToken = accessTokenAuths.find((auth) => auth.token === tokenValue);
	if (accessToken) {
		try {
			await deleteOAuthAuthorization(accessToken.id, { repo, token, host });
		} catch (error) {
			if (error instanceof UnknownRequestError) {
				const message = await error.text();
				throw new CommandError(`Failed to delete token: ${message}`);
			}
			throw error;
		}
		console.info("Token deleted");
		return;
	}

	// Search write tokens
	const writeToken = writeTokensInfo.tokens.find((t) => t.token === tokenValue);
	if (writeToken) {
		try {
			await deleteWriteToken(writeToken.token, { repo, token, host });
		} catch (error) {
			if (error instanceof UnknownRequestError) {
				const message = await error.text();
				throw new CommandError(`Failed to delete token: ${message}`);
			}
			throw error;
		}
		console.info("Token deleted");
		return;
	}

	throw new CommandError(`Token not found: ${tokenValue}`);
});
