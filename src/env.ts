import * as z from "zod/mini";

const DEFAULT_PRISMIC_SENTRY_DSN =
	"https://e1886b1775bd397cd1afc60bfd2ebfc8@o146123.ingest.us.sentry.io/4510445143588864";

export const DEFAULT_PRISMIC_HOST = "prismic.io";

const Env = z.object({
	PROD: z.stringbool(),
	PRISMIC_SENTRY_DSN: z._default(z.httpUrl(), DEFAULT_PRISMIC_SENTRY_DSN),
	PRISMIC_SENTRY_ENVIRONMENT: z.optional(z.string()),
	PRISMIC_SENTRY_ENABLED: z.optional(z.stringbool()),
	PRISMIC_TELEMETRY_ENABLED: z.optional(z.stringbool()),
	PRISMIC_HOST: z.optional(z.string()),
	PRISMIC_TOKEN: z.optional(z.string()),
	PRISMIC_DOCS_HOST: z.optional(z.string()),
	PRISMIC_CONFIG_DIR: z.optional(z.string()),
	PRISMIC_TYPE_BUILDER_ENABLED: z.optional(z.stringbool()),
	PRISMIC_SYNC_POLL_MS: z.optional(z.coerce.number().check(z.gte(100))),
	// Tests only. Code reads them behind a literal `process.env.PROD` check, so
	// production builds drop that code, and a bad value reads as unset.
	PRISMIC_AUTH0_DOMAIN: z.optional(z.string()),
	PRISMIC_AUTH0_CLIENT_ID: z.optional(z.string()),
	PRISMIC_AGENT_WAIT_MS: z.catch(z.optional(z.coerce.number().check(z.gte(1))), undefined),
});

export const env = z.parse(Env, {
	...process.env,
	// Replaced at build time by tsdown's `define`, so it must be read literally.
	PROD: process.env.PROD,
});
