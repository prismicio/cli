import { getHost, getToken } from "../auth";
import { getOAuthApps, getWriteTokens } from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { NotFoundRequestError, UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic token list",
	description: `
		List all API tokens for a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName(), json } = values;

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
		if (error instanceof NotFoundRequestError) {
			throw new CommandError(`Repository not found: ${repo}`);
		}
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to list tokens: ${message}`);
		}
		throw error;
	}

	const accessTokens = apps.flatMap((app) =>
		app.wroom_auths.map((auth) => ({
			name: app.name,
			scope: auth.scope,
			token: auth.token,
			createdAt: new Date(auth.created_at.$date).toISOString().split("T")[0],
		})),
	);
	const writeTokens = writeTokensInfo.tokens;

	if (json) {
		console.info(stringify({ accessTokens, writeTokens }));
		return;
	}

	if (accessTokens.length > 0) {
		console.info("ACCESS TOKENS");
		for (const accessToken of accessTokens) {
			console.info(`  ${accessToken.name}  ${accessToken.scope}  ${accessToken.token}  ${accessToken.createdAt}`);
		}
	} else {
		console.info("ACCESS TOKENS  (none)");
	}

	console.info("");

	if (writeTokens.length > 0) {
		console.info("WRITE TOKENS");
		for (const writeToken of writeTokens) {
			const date = new Date(writeToken.timestamp * 1000).toISOString().split("T")[0];
			console.info(`  ${writeToken.app_name}  ${writeToken.token}  ${date}`);
		}
	} else {
		console.info("WRITE TOKENS  (none)");
	}
});
