import { getHost, getToken } from "../auth";
import {
	createOAuthAuthorization,
	createOAuthApp,
	createWriteToken,
	getOAuthApps,
} from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

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
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName(), write, "allow-releases": allowReleases } = values;

	if (write && allowReleases) {
		throw new CommandError("--allow-releases is only valid for access tokens (not with --write)");
	}

	const token = await getToken();
	const host = await getHost();

	let createdToken: string;
	try {
		if (write) {
			const writeToken = await createWriteToken(CLI_APP_NAME, { repo, token, host });
			createdToken = writeToken.token;
		} else {
			const scope = allowReleases ? "master+releases" : "master";

			// Find or create the CLI OAuth app.
			const apps = await getOAuthApps({ repo, token, host });
			let app = apps.find((a) => a.name === CLI_APP_NAME);
			if (!app) app = await createOAuthApp(CLI_APP_NAME, { repo, token, host });

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

	console.info(`Token created: ${createdToken}`);
	const envVar = write ? "PRISMIC_WRITE_TOKEN" : "PRISMIC_ACCESS_TOKEN";
	console.info(`Add it to your .env file: ${envVar}=${createdToken}`);
});
