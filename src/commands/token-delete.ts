import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import {
	deleteOAuthAuthorization,
	deleteWriteToken,
	getOAuthApps,
	getWriteTokens,
} from "../lib/prismic/clients/wroom";

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

	const { token, host } = await getCredentials();

	const [apps, { tokens: writeTokens }] = await Promise.all([
		getOAuthApps({ repo, token, host }),
		getWriteTokens({ repo, token, host }),
	]);

	const accessToken = apps
		.flatMap((app) => app.wroom_auths)
		.find((auth) => auth.token === tokenValue);
	if (accessToken) {
		await deleteOAuthAuthorization(accessToken.id, { repo, token, host });
		console.info("Token deleted");
		return;
	}

	if (writeTokens.some((t) => t.token === tokenValue)) {
		await deleteWriteToken(tokenValue, { repo, token, host });
		console.info("Token deleted");
		return;
	}

	throw new CommandError(`Token not found: ${tokenValue}`);
});
