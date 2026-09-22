import * as z from "zod/mini";

const JWTPayloadSchema = z.looseObject({ exp: z.optional(z.number()) });

export function decodePayload(token: string): z.infer<typeof JWTPayloadSchema> | undefined {
	try {
		const json = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
		return z.parse(JWTPayloadSchema, json);
	} catch {
		return undefined;
	}
}
