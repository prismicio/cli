import * as v from "valibot";

const Env = v.object({
	MODE: v.string(),
	DEV: v.boolean(),
	PROD: v.boolean(),
	PRISMIC_SENTRY_DSN: v.optional(v.string()),
	PRISMIC_SENTRY_ENVIRONMENT: v.optional(v.string()),
	PRISMIC_SENTRY_ENABLED: v.optional(
		v.pipe(
			v.picklist(["true", "false"]),
			v.transform((input) => input === "true"),
		),
	),
	PRISMIC_HOST: v.optional(v.string(), "prismic.io"),
});

export const env = v.parse(Env, {
	MODE: process.env.MODE,
	DEV: process.env.MODE !== "production",
	PROD: process.env.MODE === "production",
	...process.env,
});
