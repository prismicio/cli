import * as z from "zod/mini";

import { env } from "../env";

const AMPLITUDE_API_KEY = env.PROD
	? "client-q1CoIFNVeFUqxmRSCGXVqO3vK2zQ6bDa"
	: "client-Gx378hyvV904fpcQbJnWy7i5p4nBkMZa";

const AMPLITUDE_SERVER_URL = env.PROD
	? "https://amplitude.prismic.io/"
	: "https://amplitude.wroom.io/";

const FlagResponseSchema = z.record(z.string(), z.object({ value: z.optional(z.string()) }));

export async function evaluateFlag(
	flag: string,
	args: {
		userId: string;
		groups?: Record<string, string[]>;
	},
): Promise<boolean> {
	const user: Record<string, unknown> = { user_id: args.userId };
	if (args.groups) {
		user.groups = args.groups;
	}

	const encodedUser = btoa(JSON.stringify(user)).replace(/\+/g, "-").replace(/\//g, "_");

	const url = new URL("api/sdk/v2/vardata?v=0", AMPLITUDE_SERVER_URL);
	const response = await fetch(url, {
		headers: {
			Authorization: `Api-Key ${AMPLITUDE_API_KEY}`,
			"X-Amp-Exp-User": encodedUser,
		},
	});

	if (!response.ok) {
		throw new Error(`Amplitude flag evaluation failed: ${response.status}`);
	}

	const data = z.parse(FlagResponseSchema, await response.json());

	return data[flag]?.value === "on";
}
