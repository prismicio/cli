import * as z from "zod/mini";

import { DEFAULT_PRISMIC_HOST, WROOM_PRISMIC_HOST } from "../env";
import { request } from "../lib/request";

const PROD_API_KEY = "client-q1CoIFNVeFUqxmRSCGXVqO3vK2zQ6bDa";
const WROOM_API_KEY = "client-Gx378hyvV904fpcQbJnWy7i5p4nBkMZa";

const VarDataSchema = z.partialRecord(
	z.string(),
	z.object({
		value: z.optional(z.string()),
	}),
);
type VarData = z.infer<typeof VarDataSchema>;

export async function getVariantData(
	userId: string,
	config: { groups?: Record<string, string[]>; host: string },
): Promise<VarData> {
	const { groups, host } = config;

	const user: Record<string, unknown> = { user_id: userId };
	if (groups) user.groups = groups;
	const encodedUser = btoa(JSON.stringify(user)).replace(/\+/g, "-").replace(/\//g, "_");

	const url = new URL("api/sdk/v2/vardata?v=0", getAmplitudeServiceUrl(host));
	const apiKey = getAmplitudeApiKey(host);
	const response = await request(url, {
		headers: {
			Authorization: `Api-Key ${apiKey}`,
			"X-Amp-Exp-User": encodedUser,
		},
		schema: VarDataSchema,
	});
	return response;
}

function getAmplitudeApiKey(host: string): string {
	if (host === DEFAULT_PRISMIC_HOST) return PROD_API_KEY;
	if (host === WROOM_PRISMIC_HOST) return WROOM_API_KEY;
	throw new Error(
		`The Amplitude service is only supported in: ${DEFAULT_PRISMIC_HOST}, ${WROOM_PRISMIC_HOST}`,
	);
}

function getAmplitudeServiceUrl(host: string): URL {
	return new URL(`https://amplitude.${host}/`);
}
