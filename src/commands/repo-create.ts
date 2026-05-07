import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { checkIsDomainAvailable, createRepository } from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { validateRepositoryDomain } from "../lib/repositoryDomain";

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

	const available = await checkIsDomainAvailable({ domain: name, token, host });
	if (!available) {
		throw new CommandError(
			`Repository name "${name}" is already taken. Choose another.`,
		);
	}

	const adapter = await getAdapter().catch(() => undefined);
	const framework = adapter?.id ?? "other";

	try {
		await createRepository({
			domain: name,
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

	return name;
}
