import * as z from "zod/mini";

import { request } from "../../request";

const RepositoriesSchema = z.array(
	z.object({
		domain: z.string(),
		name: z.optional(z.string()),
		// A role is a string (e.g. "Owner") for repositories with a single
		// role, or a record of locale to role (e.g. { "de-de": "Writer" })
		// for repositories with locale-scoped roles.
		role: z.optional(z.union([z.string(), z.record(z.string(), z.string())])),
	}),
);
type Repositories = z.infer<typeof RepositoriesSchema>;

export async function getRepositories(config: {
	token: string | undefined;
	host: string;
}): Promise<Repositories> {
	const url = new URL("repositories", `https://user-service.${config.host}/`);
	return request(url, {
		credentials: { "prismic-auth": config.token },
		schema: RepositoriesSchema,
		unknownErrorMessage: "Failed to load your repositories",
	});
}
