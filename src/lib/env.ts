import * as v from "valibot";

const Env = v.object({
	PRISMIC_HOST: v.optional(v.string(), "prismic.io"),
});

export const env = v.parse(Env, {
	...import.meta.env,
	...process.env,
});
