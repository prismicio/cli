import * as Sentry from "@sentry/node-core/light";

import packageJson from "../../package.json" with { type: "json" };
import { env } from "../env";

function isSentryEnabled(): boolean {
	return env.PRISMIC_SENTRY_ENABLED ?? env.PROD;
}

function detectEnvironment(): string {
	if (env.PRISMIC_SENTRY_ENVIRONMENT) {
		return env.PRISMIC_SENTRY_ENVIRONMENT;
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
			dsn: env.PRISMIC_SENTRY_DSN,
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

export async function sentryCaptureError(error: unknown): Promise<void> {
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

export const sentrySetUser = Sentry.setUser;
export const sentrySetTag = Sentry.setTag;
export const sentrySetContext = Sentry.setContext;
