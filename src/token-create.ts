import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request, UnauthorizedRequestError } from "./lib/request";
import { getRepoUrl } from "./lib/url";
import {
	type AccessToken,
	AccessTokenSchema,
	getAccessTokens,
	type OAuthApp,
	OAuthAppSchema,
	type WriteToken,
	WriteTokenSchema,
} from "./token-list";

const HELP = `
Create a new API token for a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic token create [flags]

FLAGS
  -w, --write              Create a write token (Custom Types/Migration API)
  -n, --name string        Token name (default: "Prismic CLI")
      --allow-releases     Allow access to releases (access tokens only)
      --json               Output as JSON
  -r, --repo string        Repository domain
  -h, --help               Show help for command

LEARN MORE
  Use \`prismic token <command> --help\` for more information about a command.
`.trim();

const DEFAULT_APP_NAME = "Prismic CLI";

export async function tokenCreate(): Promise<void> {
	const {
		values: {
			help,
			repo = await safeGetRepositoryFromConfig(),
			json,
			write,
			name = DEFAULT_APP_NAME,
			"allow-releases": allowReleases,
		},
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "token", "create"
		options: {
			json: { type: "boolean" },
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
			write: { type: "boolean", short: "w" },
			name: { type: "string", short: "n" },
			"allow-releases": { type: "boolean" },
		},
		allowPositionals: false,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!repo) {
		console.error("Missing prismic.config.json or --repo option");
		process.exitCode = 1;
		return;
	}

	if (write && allowReleases) {
		console.error("--allow-releases is only valid for access tokens (not with --write)");
		process.exitCode = 1;
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

	if (write) {
		const result = await createWriteToken(repo, name);
		if (!result.ok) {
			if (
				result.error instanceof ForbiddenRequestError ||
				result.error instanceof UnauthorizedRequestError
			) {
				handleUnauthenticated();
			} else if (v.isValiError(result.error)) {
				console.error(
					`Failed to create write token: Invalid response: ${stringify(result.error.issues)}`,
				);
				process.exitCode = 1;
			} else {
				console.error(`Failed to create write token: ${stringify(result.value)}`);
				process.exitCode = 1;
			}
			return;
		}

		if (json) {
			console.info(stringify(result.value));
		} else {
			console.info(`Token created: ${result.value.token}`);
		}
	} else {
		const scope = allowReleases ? "master+releases" : "master";
		const result = await createAccessToken(repo, name, scope);
		if (!result.ok) {
			if (
				result.error instanceof ForbiddenRequestError ||
				result.error instanceof UnauthorizedRequestError
			) {
				handleUnauthenticated();
			} else if (v.isValiError(result.error)) {
				console.error(
					`Failed to create access token: Invalid response: ${stringify(result.error.issues)}`,
				);
				process.exitCode = 1;
			} else {
				console.error(`Failed to create access token: ${stringify(result.value)}`);
				process.exitCode = 1;
			}
			return;
		}

		if (json) {
			console.info(stringify(result.value));
		} else {
			console.info(`Token created: ${result.value.token}`);
		}
	}
}

type CreateWriteTokenResult =
	| { ok: true; value: WriteToken }
	| { ok: false; value: unknown; error: Error | v.ValiError<typeof WriteTokenSchema> };

async function createWriteToken(repo: string, appName: string): Promise<CreateWriteTokenResult> {
	const url = new URL("settings/security/token", await getRepoUrl(repo));
	const response = await request(url, {
		method: "POST",
		body: { app_name: appName },
		schema: WriteTokenSchema,
	});
	return response;
}

type CreateAccessTokenResult =
	| { ok: true; value: AccessToken }
	| { ok: false; value: unknown; error: Error | v.ValiError<typeof AccessTokenSchema> };

async function createAccessToken(
	repo: string,
	appName: string,
	scope: "master" | "master+releases",
): Promise<CreateAccessTokenResult> {
	// First, find or create an OAuth app with the given name
	const appsResponse = await getAccessTokens(repo);
	if (!appsResponse.ok) {
		return appsResponse;
	}

	let app = appsResponse.value.find((a: OAuthApp) => a.name === appName);

	// Create OAuth app if it doesn't exist
	if (!app) {
		const createAppUrl = new URL("settings/security/oauthapp", await getRepoUrl(repo));
		const createAppResponse = await request(createAppUrl, {
			method: "POST",
			body: { app_name: appName },
			schema: OAuthAppSchema,
		});

		if (!createAppResponse.ok) {
			return createAppResponse;
		}

		app = createAppResponse.value;
	}

	// Create the authorization token
	const authUrl = new URL("settings/security/authorizations", await getRepoUrl(repo));
	const authResponse = await request(authUrl, {
		method: "POST",
		body: { app: app.id, scope },
		schema: AccessTokenSchema,
	});

	return authResponse;
}

function handleUnauthenticated(): void {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
