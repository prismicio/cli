import * as z from "zod/mini";

const JWTPayloadSchema = z.looseObject({
	iss: z.optional(z.string()),
	sub: z.optional(z.string()),
	aud: z.optional(z.string()),
	exp: z.optional(z.number()),
	nbf: z.optional(z.number()),
	iat: z.optional(z.number()),
	jti: z.optional(z.string()),
});
export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

export function decodePayload(token: string): JWTPayload | undefined {
	try {
		const [, encoded] = token.split(".");
		if (!encoded) return undefined;
		const json = JSON.parse(Buffer.from(encoded, "base64url").toString());
		return z.parse(JWTPayloadSchema, json);
	} catch {
		return undefined;
	}
}
