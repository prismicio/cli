import * as z from "zod/mini";

import { request } from "../../request";

const ProfileSchema = z.object({
	email: z.string(),
	shortId: z.string(),
	intercomHash: z.string(),
	repositories: z.array(
		z.object({
			domain: z.string(),
			name: z.optional(z.string()),
			// A role is a string (e.g. "Owner") for repositories with a single
			// role, or a record of locale to role (e.g. { "de-de": "Writer" })
			// for repositories with locale-scoped roles.
			role: z.optional(z.union([z.string(), z.record(z.string(), z.string())])),
		}),
	),
});
export type Profile = z.infer<typeof ProfileSchema>;

export async function getProfile(config: {
	token: string | undefined;
	host: string;
}): Promise<Profile> {
	return request(new URL("profile", `https://user-service.${config.host}/`), {
		credentials: { "prismic-auth": config.token },
		schema: ProfileSchema,
		unknownErrorMessage: "Failed to load your profile",
	});
}
