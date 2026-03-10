import * as Sentry from "@sentry/node-core/light";

import packageJson from "../../package.json" with { type: "json" };

const SENTRY_DSN =
	import.meta.env.PRISMIC_SENTRY_DSN ||
	"https://e1886b1775bd397cd1afc60bfd2ebfc8@o146123.ingest.us.sentry.io/4510445143588864";

function isSentryEnabled(): boolean {
	if (import.meta.env.PRISMIC_SENTRY_ENABLED === undefined) {
		return import.meta.env.PROD;
	}

	return import.meta.env.PRISMIC_SENTRY_ENABLED === "true";
}

function detectEnvironment(): string {
	if (import.meta.env.PRISMIC_SENTRY_ENVIRONMENT) {
		return import.meta.env.PRISMIC_SENTRY_ENVIRONMENT;
	}
	const prereleaseMatch = packageJson.version.match(/-(.+?)\./);
	return prereleaseMatch ? prereleaseMatch[1] : "production";
}

export function setupSentry(): void {
	try {
		if (!isSentryEnabled()) {
			return;
		}

		Sentry.init({
			dsn: SENTRY_DSN,
			release: packageJson.version,
			environment: detectEnvironment(),
			defaultIntegrations: false,
			integrations: [],
			maxValueLength: 2_500,
		});

		Sentry.setContext("Process", {
			command: process.argv.join(" "),
			cwd: process.cwd(),
		});
	} catch {
		// Silent failure — never breaks the CLI
	}
}

export async function captureError(error: unknown): Promise<void> {
	try {
		if (!isSentryEnabled()) {
			return;
		}

		Sentry.captureException(
			error,
			error instanceof Error
				? { extra: { cause: error.cause, fullCommand: process.argv.join(" ") } }
				: {},
		);

		await Sentry.flush();
	} catch {
		// Silent failure — never breaks the CLI
	}
}

// Re-exports for future devtools-parity integration points
export const setUser = Sentry.setUser;
export const setTag = Sentry.setTag;
export const setContext = Sentry.setContext;
