import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { checkIsDomainAvailable, createRepository } from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { NotFoundRequestError, UnknownRequestError } from "../lib/request";

const MAX_DOMAIN_TRIES = 5;

const config = {
	name: "prismic repo create",
	description: "Create a new Prismic repository.",
	options: {
		name: { type: "string", short: "n", description: "Display name for the repository" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { name } = values;

	const token = await getToken();
	const host = await getHost();

	const domain = await findAvailableDomain({ token, host });
	if (!domain) {
		throw new CommandError("Failed to create a repository. Please try again.");
	}

	const adapter = await getAdapter().catch(() => undefined);
	const framework = adapter?.id ?? "other";

	try {
		await createRepository({ domain, name: name ?? domain, framework, token, host });
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			throw new CommandError(`Repository not found: ${domain}`);
		}
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to create repository: ${message}`);
		}
		throw error;
	}

	console.info(`Repository created: ${domain}`);
	console.info(`URL: https://${domain}.${host}/`);
});

async function findAvailableDomain(config: {
	token: string | undefined;
	host: string;
}): Promise<string | undefined> {
	const { token, host } = config;
	let domain;
	for (let i = 0; i < MAX_DOMAIN_TRIES; i++) {
		const candidate = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
		const available = await checkIsDomainAvailable({ domain: candidate, token, host });
		if (available) {
			domain = candidate;
			break;
		}
	}
	return domain;
}
