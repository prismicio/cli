import * as z from "zod/mini";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { checkIsDomainAvailable, createRepository } from "../clients/wroom";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";

export const repositoryNameSchema = z
	.string()
	.check(
		z.minLength(4, "Must be at least 4 characters"),
		z.maxLength(63, "Must be at most 63 characters"),
		z.regex(
			/^[a-zA-Z0-9][-a-zA-Z0-9]{2,}[a-zA-Z0-9]$/,
			"Must contain only letters, numbers, and hyphens, and start and end with a letter or number",
		),
	);

const config = {
	name: "prismic repo create",
	description: "Create a new Prismic repository.",
	options: {
		name: {
			type: "string",
			short: "n",
			description: "Repository name (used as the domain)",
			required: true,
			schema: repositoryNameSchema,
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

	const domain = name.toLowerCase();

	const available = await checkIsDomainAvailable({ domain, token, host });
	if (!available) {
		throw new CommandError(
			`Repository name "${domain}" is already taken. Choose a different name or request access to it.`,
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
