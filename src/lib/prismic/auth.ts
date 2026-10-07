import * as z from "zod/mini";

import { UnauthorizedRequestError } from "../request";

const InvalidAuthContextSchema = z.object({ error: z.literal("invalid_auth_context") });

export function isInvalidAuthContextError(error: unknown): boolean {
	return (
		error instanceof UnauthorizedRequestError &&
		z.safeParse(InvalidAuthContextSchema, error.body).success
	);
}
