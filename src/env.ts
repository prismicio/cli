import * as z from "zod/mini";

const Env = z.object({
	MODE: z.string(),
	DEV: z.boolean(),
	PROD: z.boolean(),
	PRISMIC_SENTRY_DSN: z.optional(z.string()),
	PRISMIC_SENTRY_ENVIRONMENT: z.optional(z.string()),
	PRISMIC_SENTRY_ENABLED: z.optional(z.stringbool()),
	PRISMIC_HOST: z._default(z.optional(z.string()), "prismic.io"),
});

export const env = z.parse(Env, {
	MODE: process.env.MODE,
	DEV: process.env.MODE !== "production",
	PROD: process.env.MODE === "production",
	...process.env,
});
