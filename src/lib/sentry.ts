type SentryFrame = {
	function: string;
	filename: string;
	lineno: number;
	colno: number;
	in_app: boolean;
};

type SentryConfig = { dsn: string; appName: string; appVersion: string; environment?: string };

type SentryScope = {
	tags: Record<string, string>;
	contexts: Record<string, Record<string, unknown>>;
	user?: { id: string };
};

// Set by `setupSentry`. While unset, `sentryCaptureError` is a no-op.
let config: SentryConfig | undefined;

const scope: SentryScope = { tags: {}, contexts: {} };

export function setupSentry(options: SentryConfig): void {
	config = options;
	scope.contexts.Process = {
		command: process.argv.join(" "),
		cwd: process.cwd(),
	};
}

export function sentrySetTag(key: string, value: string): void {
	scope.tags[key] = value;
}

export function sentrySetContext(key: string, value: Record<string, unknown>): void {
	scope.contexts[key] = value;
}

export function sentrySetUser(user: { id: string }): void {
	scope.user = user;
}

export async function sentryCaptureError(error: unknown): Promise<void> {
	if (!config) return;

	try {
		const dsn = new URL(config.dsn);
		const err = error instanceof Error ? error : new Error(String(error));
		const eventId = crypto.randomUUID().replace(/-/g, "");
		const event = {
			event_id: eventId,
			timestamp: Date.now() / 1000,
			platform: "node",
			level: "error",
			release: config.appVersion,
			environment: config.environment || extractEnvironment(config.appVersion),
			tags: scope.tags,
			user: scope.user,
			contexts: {
				...scope.contexts,
				runtime: { name: "node", version: process.versions.node },
			},
			exception: {
				values: [
					{
						type: err.name,
						value: err.message.slice(0, 2_500),
						stacktrace: parseStack(err),
					},
				],
			},
			extra: { cause: err.cause, fullCommand: process.argv.join(" ") },
		};

		const body = [
			JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
			JSON.stringify({ type: "event" }),
			JSON.stringify(event),
		].join("\n");

		await fetch(envelopeEndpoint(dsn), {
			method: "POST",
			headers: {
				"Content-Type": "application/x-sentry-envelope",
				"X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=${config.appName}/${config.appVersion}, sentry_key=${dsn.username}`,
			},
			body,
			signal: AbortSignal.timeout(2_000),
		});
	} catch {
		// Silent failure — never breaks the CLI
	}
}

function extractEnvironment(version: string): string {
	const prereleaseMatch = version.match(/-(.+?)\./);
	return prereleaseMatch ? prereleaseMatch[1] : "production";
}

// Derive the ingest URL from a DSN: https://<key>@<host>/<projectId>
function envelopeEndpoint(dsn: URL): string {
	return `${dsn.protocol}//${dsn.host}/api${dsn.pathname}/envelope/`;
}

// Parse a V8 `error.stack` into Sentry stack frames. Sentry orders frames
// oldest-first (the crashing frame last), the reverse of V8's order.
function parseStack(error: Error): { frames: SentryFrame[] } | undefined {
	const frames: SentryFrame[] = [];
	for (const line of (error.stack ?? "").split("\n").slice(1)) {
		const match = line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
		if (!match) continue;
		frames.push({
			function: match[1] || "?",
			filename: match[2],
			lineno: Number(match[3]),
			colno: Number(match[4]),
			in_app: true,
		});
	}
	return frames.length > 0 ? { frames: frames.reverse() } : undefined;
}
