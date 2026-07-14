import * as z from "zod/mini";

import { request, type RequestOptions } from "../../request";

type UserConfig = {
	token: string | undefined;
	host: string;
};

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

export async function getProfile(config: UserConfig): Promise<Profile> {
	const url = new URL("profile", getUserServiceUrl(config.host));
	return userServiceRequest(url, config, { schema: ProfileSchema });
}

function userServiceRequest<T>(
	url: URL,
	config: UserConfig,
	options: RequestOptions<T> = {},
): Promise<T> {
	return request(url, {
		credentials: { "prismic-auth": config.token },
		...options,
	});
}

function getUserServiceUrl(host: string): URL {
	return new URL(`https://user-service.${host}/`);
}
