interface ImportMetaEnv {
	readonly MODE: string;
	readonly DEV: boolean;
	readonly PROD: boolean;
	readonly PRISMIC_SENTRY_DSN: string | undefined;
	readonly PRISMIC_SENTRY_ENVIRONMENT: string | undefined;
	readonly PRISMIC_SENTRY_ENABLED: string | undefined;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
