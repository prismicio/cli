import * as z from "zod/mini";

import { decodePayload } from "../jwt";

// A Write API token carries the repository and the app. A user session does not.
const WriteApiTokenSchema = z.object({
	domain: z.string().check(z.minLength(1)),
	appName: z.string().check(z.minLength(1)),
});
export type WriteApiToken = z.infer<typeof WriteApiTokenSchema>;

export function readWriteApiToken(token: string | undefined): WriteApiToken | undefined {
	if (!token) return undefined;
	const parsed = z.safeParse(WriteApiTokenSchema, decodePayload(token));
	if (!parsed.success) return undefined;
	return parsed.data;
}
