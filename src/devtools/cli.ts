import { parseArgs } from "node:util";

import { createPrismicManager } from "@prismicio/manager";
import * as z from "zod";

import { name as pkgName, version as pkgVersion } from "./package.json";

import { init } from "./commands/init";
import { FRAMEWORK_PLUGINS } from "./core/framework";
import { handleSilentError } from "./utils/error";
import { displayError, displayHeader } from "./utils/output";
import { setupSentry, trackSentryError } from "./utils/sentry";
import { initTelemetry, trackErrorTelemetry } from "./utils/telemetry";

const HELP = `
DOCUMENTATION
  https://prismic.io/docs

VERSION
  ${pkgName}@${pkgVersion}

USAGE
  $ prismic init --repository <repository-id>

OPTIONS
  --repository, -r        Specify a Prismic repository
  --help, -h              Display CLI help
  --version, -v           Display CLI version
`.trim();

const { values, positionals } = parseArgs({
	args: process.argv.slice(2),
	options: {
		repository: { type: "string", short: "r" },
		help: { type: "boolean", short: "h", default: false },
		version: { type: "boolean", short: "v", default: false },
	},
	allowPositionals: true,
	strict: true,
});

export const CLIArgs = z.object({
	commandType: z.literal("init"),
	help: z.boolean().optional(),
	version: z.boolean().optional(),
	repository: z
		.string()
		.min(1, "Repository name is required to initialize a project"),
});

export async function run(): Promise<void> {
	// Display header immediately so user sees something is happening
	displayHeader();

	// Setup Sentry as early as possible to track ALL errors
	setupSentry();

	// Handle help flag (exit early, no telemetry needed)
	if (values.help) {
		console.info(HELP);
		process.exit(0);
	}

	// Handle version flag (exit early, no telemetry needed)
	if (values.version) {
		console.info(`${pkgName}@${pkgVersion}`);
		process.exit(0);
	}

	// Validate CLI arguments first (before any operations that might fail)
	const cliArgs = CLIArgs.safeParse({
		...values,
		commandType: positionals[0],
	});

	// Invalid arguments - track with Sentry even though it's a user error
	if (!cliArgs.success) {
		const error = new Error(cliArgs.error.message);
		displayError(error);
		await trackSentryError(error);
		process.exit(1);
	}

	// Too many arguments - track with Sentry
	if (positionals.length > 1) {
		const error = new Error("Too many arguments. Expected 'init'.");
		displayError(error);
		await trackSentryError(error);
		process.exit(1);
	}

	// Create manager - wrap in try-catch to track failures
	let manager;
	try {
		manager = createPrismicManager({
			cwd: process.cwd(),
			nativePlugins: FRAMEWORK_PLUGINS,
		});
	} catch (error) {
		// Manager creation failed - track with Sentry (telemetry not available yet)
		displayError(error);
		await trackSentryError(error);
		process.exit(1);
	}

	const commandType = cliArgs.data.commandType;
	const repositoryName = cliArgs.data.repository;

	// Initialize telemetry as early as possible (after manager creation)
	// Track initialization failures with Sentry
	try {
		await initTelemetry({
			manager,
			commandType,
			repositoryName,
		});
	} catch (telemetryError) {
		// Telemetry initialization failed - track with Sentry but continue execution
		// This prevents telemetry issues from breaking the CLI
		await trackSentryError(telemetryError);
		handleSilentError(telemetryError, "Telemetry initialization error");
	}

	// Execute command - all errors here will be tracked
	try {
		await init({
			manager,
			repositoryName: cliArgs.data.repository,
		});
		process.exit(0);
	} catch (error) {
		displayError(error);

		// Always track with Sentry first (most reliable)
		await trackSentryError(error);

		// Try to track with telemetry if it was initialized
		// If telemetry wasn't initialized or tracking fails, Sentry already has it
		try {
			await trackErrorTelemetry({
				manager,
				error,
				commandType,
			});
		} catch (telemetryError) {
			handleSilentError(telemetryError, "Telemetry tracking error");
		}

		process.exit(1);
	}
}
