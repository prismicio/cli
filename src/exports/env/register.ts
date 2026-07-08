import { getEnvironment } from "../../environments";

const environment = await getEnvironment();
if (environment) {
	process.env.NEXT_PUBLIC_PRISMIC_ENVIRONMENT ??= environment;
	process.env.PUBLIC_PRISMIC_ENVIRONMENT ??= environment;
	process.env.NUXT_PUBLIC_PRISMIC_ENVIRONMENT ??= environment;
}
