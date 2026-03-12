import * as z from "zod/mini";

const DEFAULT_PRISMIC_SENTRY_DSN =
	"https://e1886b1775bd397cd1afc60bfd2ebfc8@o146123.ingest.us.sentry.io/4510445143588864";

const Env = z.object({
	MODE: z.string(),
	DEV: z.stringbool(),
	PROD: z.stringbool(),
	TEST: z.stringbool(),
	PRISMIC_SENTRY_DSN: z._default(z.httpUrl(), DEFAULT_PRISMIC_SENTRY_DSN),
	PRISMIC_SENTRY_ENVIRONMENT: z.optional(z.string()),
	PRISMIC_SENTRY_ENABLED: z.optional(z.stringbool()),
	PRISMIC_HOST: z.optional(z.string()),
});

export const env = z.parse(Env, {
	...process.env,
	MODE: process.env.MODE,
	DEV: process.env.DEV,
	PROD: process.env.PROD,
	TEST: process.env.TEST,
});
