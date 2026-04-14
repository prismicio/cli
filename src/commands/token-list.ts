import { getHost, getToken } from "../auth";
import { getOAuthApps, getWriteTokens } from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { UnknownRequestError } from "../lib/request";
import { formatTable } from "../lib/string";
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
		const rows = accessTokens.map((t) => [`  ${t.name}`, t.scope, t.token, t.createdAt]);
		console.info(formatTable(rows));
	} else {
		console.info("ACCESS TOKENS  (none)");
	}

	console.info("");

	if (writeTokens.length > 0) {
		console.info("WRITE TOKENS");
		const rows = writeTokens.map((t) => {
			const date = new Date(t.timestamp * 1000).toISOString().split("T")[0];
			return [`  ${t.app_name}`, t.token, date];
		});
		console.info(formatTable(rows));
	} else {
		console.info("WRITE TOKENS  (none)");
	}
});
