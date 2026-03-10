import * as v from "valibot";

import { getToken } from "./auth";
import { getUserServiceUrl } from "./url";

const PrismicUserProfileSchema = v.object({
	userId: v.string(),
	shortId: v.string(),
	intercomHash: v.string(),
	email: v.string(),
	firstName: v.string(),
	lastName: v.string(),
});

export type PrismicUserProfile = v.InferOutput<typeof PrismicUserProfileSchema>;

export async function getProfile(): Promise<PrismicUserProfile> {
	const token = await getToken();
	if (!token) {
		throw new Error("Not authenticated. Log in before trying again.");
	}

	const baseUrl = await getUserServiceUrl();
	const url = new URL("profile", baseUrl);

	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});

	if (!response.ok) {
		throw new Error("Failed to retrieve profile from the Prismic user service.");
	}

	const json = await response.json();

	return v.parse(PrismicUserProfileSchema, json);
}
