import { getHost, getToken } from "../auth";
import {
	createAuthorization,
	createOAuthApp,
	createWriteToken,
	getOAuthApps,
} from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
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
		write: { type: "boolean", short: "w", description: "Create a write token" },
		"allow-releases": {
			type: "boolean",
			description: "Allow access to releases (non-write tokens only)",
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

	if (write) {
		const writeToken = await createWriteToken(CLI_APP_NAME, { repo, token, host });
		console.info(`Token created: ${writeToken.token}`);
	} else {
		const scope = allowReleases ? "master+releases" : "master";

		// Find or create the CLI OAuth app.
		const apps = await getOAuthApps({ repo, token, host });
		let app = apps.find((a) => a.name === CLI_APP_NAME);
		if (!app) app = await createOAuthApp(CLI_APP_NAME, { repo, token, host });

		const accessToken = await createAuthorization(app.id, scope, { repo, token, host });
		console.info(`Token created: ${accessToken.token}`);
	}
});
