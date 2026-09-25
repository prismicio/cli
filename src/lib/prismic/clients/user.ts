import * as z from "zod/mini";

import { request } from "../../request";

const ProfileSchema = z.object({
	email: z.string(),
	shortId: z.string(),
	intercomHash: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

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
