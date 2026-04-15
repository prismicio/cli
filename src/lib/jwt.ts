import * as z from "zod/mini";

const JWTPayloadSchema = z.looseObject({
	exp: z.optional(z.number()),
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
