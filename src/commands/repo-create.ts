import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { checkIsDomainAvailable, createRepository } from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";

const DOMAIN_REGEX = /^[a-zA-Z0-9][-a-zA-Z0-9]{2,}[a-zA-Z0-9]$/;
const MIN_LENGTH = 4;
const MAX_LENGTH = 63;

export function validateRepositoryDomain(name: string): void {
	if (name.length < MIN_LENGTH || name.length > MAX_LENGTH || !DOMAIN_REGEX.test(name)) {
		throw new CommandError(
			`Invalid repository name "${name}". Must be ${MIN_LENGTH}–${MAX_LENGTH} characters, letters/numbers/hyphens only, and start and end with a letter or number.`,
		);
	}
}

const config = {
	name: "prismic repo create",
	description: "Create a new Prismic repository.",
	options: {
		name: {
			type: "string",
			short: "n",
			description: "Repository name (used as the domain)",
			required: true,
		},
		"display-name": {
			type: "string",
			short: "d",
			description: "Display name for the repository (defaults to --name)",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { name, "display-name": displayName } = values;

	const token = await getToken();
	const host = await getHost();
	const domain = await createRepo({ name, displayName, token, host });

	console.info(`Repository created: ${domain}`);
	console.info(`URL: https://${domain}.${host}/`);
});

export async function createRepo(config: {
	name: string;
	displayName?: string;
	token: string | undefined;
	host: string;
}): Promise<string> {
	const { name, displayName, token, host } = config;

	validateRepositoryDomain(name);
	const domain = name.toLowerCase();

	const available = await checkIsDomainAvailable({ domain, token, host });
	if (!available) {
		throw new CommandError(
			`Repository name "${domain}" is already taken. Choose another.`,
		);
	}

	const adapter = await getAdapter().catch(() => undefined);
	const framework = adapter?.id ?? "other";

	try {
		await createRepository({
			domain,
			name: displayName ?? name,
			framework,
			token,
			host,
		});
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to create repository: ${message}`);
		}
		throw error;
	}

	return domain;
}
