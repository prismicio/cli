import * as z from "zod/mini";

import { UnauthorizedRequestError } from "../request";

const InvalidAuthContextSchema = z.object({ error: z.literal("invalid_auth_context") });

// The credential is valid, but the route needs a user, e.g. a Write API token on an admin route.
export function isInvalidAuthContextError(error: unknown): boolean {
	return (
		error instanceof UnauthorizedRequestError &&
		z.safeParse(InvalidAuthContextSchema, error.body).success
	);
}

export function ignoreInvalidAuthContext(error: unknown): undefined {
	if (!isInvalidAuthContextError(error)) throw error;
}
