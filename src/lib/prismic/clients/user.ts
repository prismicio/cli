import * as z from "zod/mini";

import { request } from "../../request";

const ProfileSchema = z.object({
	email: z.string(),
	shortId: z.string(),
	intercomHash: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

// A role is a string (e.g. "Owner") for a repository with one role, or a
// record of locale to role (e.g. { "de-de": "Writer" }) when roles are
// locale-scoped. A Write API token sends a string role, or omits it.
const RepositorySchema = z.object({
	domain: z.string(),
	name: z.optional(z.string()),
	role: z.optional(z.union([z.string(), z.record(z.string(), z.string())])),
});

const RepositoryListSchema = z.object({
	repositories: z.array(RepositorySchema),
});

export async function getProfile(config: {
	token: string | undefined;
	host: string;
}): Promise<Profile> {
	const url = new URL("user/profile", `https://api.internal.${config.host}/`);
	return request(url, {
		headers: { Authorization: `Bearer ${config.token}` },
		schema: ProfileSchema,
		unknownErrorMessage: "Failed to load your profile",
	});
}

export async function getRepositories(config: {
	token: string | undefined;
	host: string;
}): Promise<z.infer<typeof RepositorySchema>[]> {
	const url = new URL("user/repositories", `https://api.internal.${config.host}/`);
	const response = await request(url, {
		headers: { Authorization: `Bearer ${config.token}` },
		schema: RepositoryListSchema,
		unknownErrorMessage: "Failed to load your repositories",
	});
	return response.repositories;
}
