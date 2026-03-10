import * as v from "valibot";

import { env } from "../lib/env";
import { request } from "../lib/request";

const ProfileSchema = v.object({
	email: v.string(),
	repositories: v.array(
		v.object({
			domain: v.string(),
			name: v.optional(v.string()),
		}),
	),
});
export type Profile = v.InferOutput<typeof ProfileSchema>;

export async function getProfile(config: {
	token: string | undefined;
	host: string | undefined;
}): Promise<Profile> {
	const { token, host } = config;
	const userServiceUrl = getUserServiceUrl(host);
	const url = new URL("profile", userServiceUrl);
	const response = await request(url, {
		credentials: { "prismic-auth": token },
		schema: ProfileSchema,
	});
	return response;
}

function getUserServiceUrl(host = env.PRISMIC_HOST): URL {
	return new URL(`https://user-service.${host}/`);
}
