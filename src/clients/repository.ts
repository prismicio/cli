import * as z from "zod/mini";

import { NotFoundRequestError, request } from "../lib/request";

const RepositorySchema = z.object({
	quotas: z.optional(
		z.object({
			sliceMachineEnabled: z.boolean(),
		}),
	),
});

export type Repository = z.infer<typeof RepositorySchema>;

export async function getRepository(config: {
	repo: string;
	token: string | undefined;
	host: string;
}): Promise<Repository> {
	const { repo, token, host } = config;
	const url = getRepositoryServiceUrl(host);
	url.searchParams.set("repository", repo);
	try {
		const response = await request(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				repository: repo,
			},
			schema: RepositorySchema,
		});
		return response;
	} catch (error) {
		if (error instanceof NotFoundRequestError) {
			error.message = `Repository not found: ${repo}`;
		}
		throw error;
	}
}

function getRepositoryServiceUrl(host: string): URL {
	return new URL(`https://api.internal.${host}/repository/`);
}
