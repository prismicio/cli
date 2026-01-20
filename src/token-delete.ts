import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import { ForbiddenRequestError, request, UnauthorizedRequestError } from "./lib/request";
import { getRepoUrl } from "./lib/url";
import { type AccessToken, getAccessTokens, getWriteTokens, type WriteToken } from "./token-list";

const HELP = `
Delete a token from a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic token delete <token> [flags]

ARGUMENTS
  token   The token value (or partial match)

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic token <command> --help\` for more information about a command.
`.trim();

export async function tokenDelete(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig() },
		positionals: [tokenValue],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "token", "delete"
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
		if (accessResponse.error instanceof ForbiddenRequestError || accessResponse.error instanceof UnauthorizedRequestError) {
			handleUnauthenticated();
		} else if (v.isValiError(accessResponse.error)) {
			console.error(`Failed to list access tokens: Invalid response: ${stringify(accessResponse.error.issues)}`);
			process.exitCode = 1;
		} else {
			console.error(`Failed to list access tokens: ${stringify(accessResponse.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	if (!writeResponse.ok) {
		if (writeResponse.error instanceof ForbiddenRequestError || writeResponse.error instanceof UnauthorizedRequestError) {
			handleUnauthenticated();
		} else if (v.isValiError(writeResponse.error)) {
			console.error(`Failed to list write tokens: Invalid response: ${stringify(writeResponse.error.issues)}`);
			process.exitCode = 1;
		} else {
			console.error(`Failed to list write tokens: ${stringify(writeResponse.value)}`);
			process.exitCode = 1;
		}
		return;
	}

	// Find in access tokens
	let foundAuth: AccessToken | undefined;
	for (const app of accessResponse.value) {
		for (const auth of app.wroom_auths) {
			if (auth.token === tokenValue || auth.token.startsWith(tokenValue) || auth.token.endsWith(tokenValue)) {
				foundAuth = auth;
				break;
			}
		}
		if (foundAuth) break;
	}

	if (foundAuth) {
		// Delete the authorization (preserves OAuth app)
		const url = new URL(`settings/security/authorizations/${foundAuth.id}`, await getRepoUrl(repo));
		const response = await request(url, { method: "DELETE" });

		if (!response.ok) {
			if (response.error instanceof ForbiddenRequestError || response.error instanceof UnauthorizedRequestError) {
				handleUnauthenticated();
			} else {
				console.error(`Failed to delete token: ${stringify(response.value)}`);
				process.exitCode = 1;
			}
			return;
		}

		console.info("Token deleted");
		return;
	}

	// Find in write tokens
	const foundWriteToken = writeResponse.value.tokens.find(
		(t: WriteToken) => t.token === tokenValue || t.token.startsWith(tokenValue) || t.token.endsWith(tokenValue),
	);

	if (foundWriteToken) {
		// Delete write token
		const url = new URL(`settings/security/token/${foundWriteToken.token}`, await getRepoUrl(repo));
		const response = await request(url, { method: "DELETE" });

		if (!response.ok) {
			if (response.error instanceof ForbiddenRequestError || response.error instanceof UnauthorizedRequestError) {
				handleUnauthenticated();
			} else {
				console.error(`Failed to delete token: ${stringify(response.value)}`);
				process.exitCode = 1;
			}
			return;
		}

		console.info("Token deleted");
		return;
	}

	console.error(`Token not found: ${tokenValue}`);
	process.exitCode = 1;
}

function handleUnauthenticated(): void {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
