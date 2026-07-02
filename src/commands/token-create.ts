import { getHost, getToken } from "../auth";
import {
	createOAuthAuthorization,
	createOAuthApp,
	createWriteToken,
	getOAuthApps,
} from "../clients/wroom";
import { resolveEnvironment, resolveRepositoryName } from "../environments";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { UnknownRequestError } from "../lib/request";

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
		repo: { type: "string", short: "r", description: "Repository domain" },
		env: { type: "string", short: "e", description: "Environment domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const {
		repo: parentRepo = await resolveRepositoryName(),
		env,
		write,
		"allow-releases": allowReleases,
		name = CLI_APP_NAME,
		json,
	} = values;

	if (write && allowReleases) {
		throw new CommandError("--allow-releases is only valid for access tokens (not with --write)");
	}

	const token = await getToken();
	const host = await getHost();
	const repo = env ? await resolveEnvironment(env, { repo: parentRepo, token, host }) : parentRepo;

	let createdToken: string;
	let scope: string | undefined;
	try {
		if (write) {
			const writeToken = await createWriteToken(name, { repo, token, host });
			createdToken = writeToken.token;
		} else {
			scope = allowReleases ? "master+releases" : "master";

			// Find or create the OAuth app.
			const apps = await getOAuthApps({ repo, token, host });
			let app = apps.find((a) => a.name === name);
			if (!app) app = await createOAuthApp(name, { repo, token, host });

			const accessToken = await createOAuthAuthorization(app.id, scope, { repo, token, host });
			createdToken = accessToken.token;
		}
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to create token: ${message}`);
		}
		throw error;
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
