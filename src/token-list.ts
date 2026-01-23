import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { stringify } from "./lib/json";
import {
	ForbiddenRequestError,
	type ParsedRequestResponse,
	request,
	UnauthorizedRequestError,
} from "./lib/request";
import { getRepoUrl } from "./lib/url";

const HELP = `
List all API tokens for a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic token list [flags]

FLAGS
      --json          Output as JSON
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic token <command> --help\` for more information about a command.
`.trim();

export async function tokenList(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryFromConfig(), json },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "token", "list"
		options: {
			json: { type: "boolean" },
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
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

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

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

	const accessTokens = accessResponse.value.flatMap((app: OAuthApp) =>
		app.wroom_auths.map((auth: AccessToken) => ({
			name: app.name,
			appId: app.id,
			authId: auth.id,
			scope: auth.scope,
			token: auth.token,
			createdAt: auth.created_at.$date,
		})),
	);
	const writeTokens = writeResponse.value.tokens;

	if (json) {
		console.info(stringify({ accessTokens, writeTokens }));
	} else {
		if (accessTokens.length > 0) {
			console.info("ACCESS TOKENS");
			for (const token of accessTokens) {
				const truncated = truncateToken(token.token);
				const date = formatDate(token.createdAt);
				console.info(`  ${token.name}  ${token.scope}  ${truncated}  ${date}`);
			}
		} else {
			console.info("ACCESS TOKENS  (none)");
		}

		console.info("");

		if (writeTokens.length > 0) {
			console.info("WRITE TOKENS");
			for (const token of writeTokens) {
				const truncated = truncateToken(token.token);
				const date = formatDate(token.timestamp);
				console.info(`  ${token.app_name}  ${truncated}  ${date}`);
			}
		} else {
			console.info("WRITE TOKENS  (none)");
		}
	}
}

// MongoDB date format: { "$date": milliseconds }
const MongoDBDateSchema = v.object({ $date: v.number() });
type MongoDBDate = v.InferOutput<typeof MongoDBDateSchema>;

// Access Token (from OAuth app's wroom_auths array)
export const AccessTokenSchema = v.object({
	id: v.string(),
	origin: v.string(),
	domain: v.string(),
	app: v.string(),
	scope: v.string(),
	expired_at: MongoDBDateSchema,
	created_at: MongoDBDateSchema,
	owner: v.nullable(v.string()),
	token: v.string(),
});
export type AccessToken = v.InferOutput<typeof AccessTokenSchema>;

// OAuth App (container for access tokens)
export const OAuthAppSchema = v.object({
	id: v.string(),
	secret: v.string(),
	name: v.string(),
	owner: v.string(),
	created_at: MongoDBDateSchema,
	authorized_domains: v.array(v.string()),
	wroom_auths: v.array(AccessTokenSchema),
});
export type OAuthApp = v.InferOutput<typeof OAuthAppSchema>;

// Write Token
export const WriteTokenSchema = v.object({
	app_name: v.string(),
	token: v.string(),
	timestamp: v.number(),
});
export type WriteToken = v.InferOutput<typeof WriteTokenSchema>;

// Write Tokens List Response
const WriteTokensInfoSchema = v.object({
	max_tokens: v.number(),
	tokens: v.array(WriteTokenSchema),
});
type WriteTokensInfo = v.InferOutput<typeof WriteTokensInfoSchema>;

// Response schemas
const GetAccessTokensResponseSchema = v.array(OAuthAppSchema);
type GetAccessTokensResponse = v.InferOutput<typeof GetAccessTokensResponseSchema>;

export async function getAccessTokens(
	repo: string,
): Promise<ParsedRequestResponse<GetAccessTokensResponse>> {
	const url = new URL("settings/security/contentapi", await getRepoUrl(repo));
	return await request(url, { schema: GetAccessTokensResponseSchema });
}

export async function getWriteTokens(
	repo: string,
): Promise<ParsedRequestResponse<WriteTokensInfo>> {
	const url = new URL("settings/security/customtypesapi", await getRepoUrl(repo));
	return await request(url, { schema: WriteTokensInfoSchema });
}

function truncateToken(token: string): string {
	if (token.length <= 12) return token;
	return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

function formatDate(timestamp: number | MongoDBDate): string {
	// MongoDB dates are in milliseconds, plain numbers are in seconds
	const ms = typeof timestamp === "number" ? timestamp * 1000 : timestamp.$date;
	const date = new Date(ms);
	return date.toISOString().split("T")[0];
}

function handleUnauthenticated(): void {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
