import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request, UnauthorizedRequestError } from "./lib/request";
import { getRepoUrl } from "./lib/url";
import {
	getAccessTokens,
	getWriteTokens,
	type OAuthApp,
	OAuthAppSchema,
	type WriteToken,
} from "./token-list";

const HELP = `
Set the name of a token in a Prismic repository.

Note: Only access tokens can be renamed. Write tokens cannot be renamed without
changing the token value.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic token set-name <token> <name> [flags]

ARGUMENTS
  token   The token value (or partial match)
  name    New name for the token

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic token <command> --help\` for more information about a command.
`.trim();

export async function tokenSetName(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig() },
		positionals: [tokenValue, newName],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "token", "set-name"
		options: {
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!tokenValue) {
		console.error("Missing required argument: token");
		process.exitCode = 1;
		return;
	}

	if (!newName) {
		console.error("Missing required argument: name");
		process.exitCode = 1;
		return;
	}

	if (!repo) {
		console.error("Missing prismic.config.json or --repo option");
		process.exitCode = 1;
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

	// First, find the token in access tokens or write tokens
	const [accessResponse, writeResponse] = await Promise.all([
		getAccessTokens(repo),
		getWriteTokens(repo),
	]);

	if (!accessResponse.ok) {
		if (
			accessResponse.error instanceof ForbiddenRequestError ||
			accessResponse.error instanceof UnauthorizedRequestError
		) {
			handleUnauthenticated();
		} else if (v.isValiError(accessResponse.error)) {
			console.error(
				`Failed to list access tokens: Invalid response: ${stringify(accessResponse.error.issues)}`,
			);
			process.exitCode = 1;
		} else {
			console.error(`Failed to list access tokens: ${stringify(accessResponse.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	if (!writeResponse.ok) {
		if (
			writeResponse.error instanceof ForbiddenRequestError ||
			writeResponse.error instanceof UnauthorizedRequestError
		) {
			handleUnauthenticated();
		} else if (v.isValiError(writeResponse.error)) {
			console.error(
				`Failed to list write tokens: Invalid response: ${stringify(writeResponse.error.issues)}`,
			);
			process.exitCode = 1;
		} else {
			console.error(`Failed to list write tokens: ${stringify(writeResponse.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	// Find in access tokens
	let foundApp: OAuthApp | undefined;
	for (const app of accessResponse.value) {
		for (const auth of app.wroom_auths) {
			if (
				auth.token === tokenValue ||
				auth.token.startsWith(tokenValue) ||
				auth.token.endsWith(tokenValue)
			) {
				foundApp = app;
				break;
			}
		}
		if (foundApp) break;
	}

	if (foundApp) {
		// Update OAuth app name
		const url = new URL(`settings/security/oauthapp/${foundApp.id}`, await getRepoUrl(repo));
		const response = await request(url, {
			method: "POST",
			body: { name: newName },
			schema: OAuthAppSchema,
		});

		if (!response.ok) {
			if (
				response.error instanceof ForbiddenRequestError ||
				response.error instanceof UnauthorizedRequestError
			) {
				handleUnauthenticated();
			} else if (v.isValiError(response.error)) {
				console.error(
					`Failed to rename token: Invalid response: ${stringify(response.error.issues)}`,
				);
				process.exitCode = 1;
			} else {
				console.error(`Failed to rename token: ${stringify(response.value)}`);
				process.exitCode = 1;
			}
			return;
		}

		console.info(`Token renamed to: ${newName}`);
		return;
	}

	// Check if it's a write token
	const foundWriteToken = writeResponse.value.tokens.find(
		(t: WriteToken) =>
			t.token === tokenValue || t.token.startsWith(tokenValue) || t.token.endsWith(tokenValue),
	);

	if (foundWriteToken) {
		console.error(
			"Write tokens cannot be renamed. Delete and create a new token with the desired name.",
		);
		process.exitCode = 1;
		return;
	}

	console.error(`Token not found: ${tokenValue}`);
	process.exitCode = 1;
}

function handleUnauthenticated(): void {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
