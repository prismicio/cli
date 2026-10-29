import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import {
	createOAuthAuthorization,
	createOAuthApp,
	createWriteToken,
	getOAuthApps,
} from "../lib/prismic/client";

const CLI_APP_NAME = "Prismic CLI";

const config = {
	name: "prismic token create",
	description: `
		Create a new API token for a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	options: {
		write: { type: "boolean", description: "Create a write token" },
		"allow-releases": {
			type: "boolean",
			description: "Allow access to releases (read tokens only)",
		},
		name: {
			type: "string",
			short: "n",
			description: `Name to identify the token (default: "${CLI_APP_NAME}")`,
		},
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: {
			type: "string",
			short: "e",
			description: "Alias for --repo",
			deprecated: "Use `prismic env` or --repo instead.",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const {
		env,
		repo = env ?? (await getActiveRepositoryName()),
		write,
		"allow-releases": allowReleases,
		name = CLI_APP_NAME,
		json,
	} = values;

	if (write && allowReleases) {
		throw new CommandError("--allow-releases is only valid for access tokens (not with --write)");
	}

	const { host, getToken } = await getCredentials();

	let createdToken: string;
	let scope: string | undefined;
	if (write) {
		const writeToken = await createWriteToken(name, { repo, host, getToken });
		createdToken = writeToken.token;
	} else {
		scope = allowReleases ? "master+releases" : "master";

		// Find or create the OAuth app.
		const apps = await getOAuthApps({ repo, host, getToken });
		let app = apps.find((a) => a.name === name);
		if (!app) app = await createOAuthApp(name, { repo, host, getToken });

		const accessToken = await createOAuthAuthorization(app.id, scope, { repo, host, getToken });
		createdToken = accessToken.token;
	}

	if (json) {
		console.info(
			stringify({
				token: createdToken,
				type: write ? "write" : "access",
				name,
				repository: repo,
				...(scope ? { scope } : {}),
			}),
		);
		return;
	}

	console.info(`Token created: ${createdToken}`);
});
