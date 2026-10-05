import * as z from "zod/mini";

import { getCredentials } from "../auth";
import { openBrowser } from "../lib/browser";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { decodePayload } from "../lib/jwt";
import { getRepository } from "../lib/prismic/clients/repository";
import { getRepositoryAccess } from "../lib/prismic/clients/wroom";
import { ForbiddenRequestError, UnauthorizedRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const WriteApiTokenSchema = z.object({
	domain: z.string().check(z.minLength(1)),
	appName: z.string().check(z.minLength(1)),
});

const config = {
	name: "prismic repo view",
	description: `
		View details of a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	options: {
		web: { type: "boolean", short: "w", description: "Open repository in browser" },
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { repo = await getRepositoryName(), web, json } = values;

	const { token, host } = await getCredentials();
	const url = `https://${repo}.${host}/`;

	if (web) {
		openBrowser(new URL(url));
		console.info(`Opening ${url}`);
		return;
	}

	// A Write API token has no user, so the display name stays unavailable.
	// GET /syncState is an admin route and rejects the token; the access level
	// is left out instead of failing the command. The domain and URL are local.
	if (isWriteApiToken(token)) {
		const apiAccess = await readWriteTokenAccess({ repo, token, host });
		if (json) {
			console.info(stringify({ domain: repo, name: null, url, apiAccess }));
			return;
		}
		console.info(`Domain: ${repo}`);
		console.info(`URL: ${url}`);
		if (apiAccess) console.info(`Content API: ${apiAccess}`);
		return;
	}

	const [repository, access] = await Promise.all([
		getRepository({ repo, token, host }),
		getRepositoryAccess({ repo, token, host }),
	]);

	if (json) {
		console.info(
			stringify({
				domain: repo,
				name: repository.name ?? null,
				url,
				apiAccess: access,
			}),
		);
		return;
	}

	const name = repository.name || "(no name)";
	console.info(`Name: ${name}`);
	console.info(`URL: ${url}`);
	console.info(`Content API: ${access}`);
});

// A Write API token is a permanent repository credential. Its JWT carries the
// repository domain and the app name, and it has no user.
function isWriteApiToken(token: string | undefined): boolean {
	if (!token) return false;
	return z.safeParse(WriteApiTokenSchema, decodePayload(token)).success;
}

// The route rejects this credential. That rejection is the access level being
// unavailable, whether the body is the admin error or the current unauthorized
// page. Any other failure still fails the command.
async function readWriteTokenAccess(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<string | null> {
	try {
		return await getRepositoryAccess(config);
	} catch (error) {
		if (error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError) {
			return null;
		}
		throw error;
	}
}
