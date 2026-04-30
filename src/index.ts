#!/usr/bin/env node

import { parseArgs } from "node:util";

import packageJson from "../package.json" with { type: "json" };
import { getAdapter, NoSupportedFrameworkError } from "./adapters";
import { cleanupLegacyAuthFile, getHost, getToken, spawnTokenRefresh } from "./auth";
import { getProfile } from "./clients/user";
import docs from "./commands/docs";
import fetch from "./commands/fetch";
import field from "./commands/field";
import gen from "./commands/gen";
import init from "./commands/init";
import locale from "./commands/locale";
import login from "./commands/login";
import logout from "./commands/logout";
import preview from "./commands/preview";
import pull from "./commands/pull";
import push from "./commands/push";
import repo from "./commands/repo";
import slice from "./commands/slice";
import sync from "./commands/sync";
import token from "./commands/token";
import type_ from "./commands/type";
import webhook from "./commands/webhook";
import whoami from "./commands/whoami";
import { UPDATE_NOTIFIER_STATE_PATH } from "./config";
import { CommandError, createCommandRouter } from "./lib/command";
import {
	ForbiddenRequestError,
	NotFoundRequestError,
	UnauthorizedRequestError,
} from "./lib/request";
import {
	initSegment,
	segmentIdentify,
	segmentSetRepository,
	segmentTrackEnd,
	segmentTrackStart,
} from "./lib/segment";
import {
	sentryCaptureError,
	sentrySetContext,
	sentrySetTag,
	sentrySetUser,
	setupSentry,
} from "./lib/sentry";
import { decodePayload } from "./lib/jwt";
import { dedent } from "./lib/string";
import { initUpdateNotifier } from "./lib/update-notifier";
import { InvalidPrismicConfigError, MissingPrismicConfigError } from "./project";
import { safeGetRepositoryName, TypeBuilderRequiredError } from "./project";

const UNTRACKED_COMMANDS = ["login", "logout", "whoami", "sync", "fetch", "docs"];

const router = createCommandRouter({
	name: "prismic",
	description: "Prismic CLI for managing repositories and configurations.",
	sections: {
		DOCUMENTATION: `
			Run \`prismic docs list\` to browse available documentation topics.
			Run \`prismic docs view <path>\` to read a topic.
		`,
	},
	commands: {
		init: {
			handler: init,
			description: "Initialize a Prismic project",
		},
		docs: {
			handler: docs,
			description: "Browse Prismic documentation",
		},
		gen: {
			handler: gen,
			description: "Generate files from local models",
		},
		pull: {
			handler: pull,
			description: "Pull types and slices from Prismic",
		},
		fetch: {
			handler: fetch,
			description: "Refresh snapshot of remote types and slices",
		},
		push: {
			handler: push,
			description: "Push types and slices to Prismic",
		},
		sync: {
			handler: sync,
			description: "Sync types and slices from Prismic",
		},
		locale: {
			handler: locale,
			description: "Manage locales",
		},
		repo: {
			handler: repo,
			description: "Manage repositories",
		},
		type: {
			handler: type_,
			description: "Manage content types",
		},
		field: {
			handler: field,
			description: "Manage fields",
		},
		slice: {
			handler: slice,
			description: "Manage slices",
		},
		preview: {
			handler: preview,
			description: "Manage preview configurations",
		},
		token: {
			handler: token,
			description: "Manage API tokens",
		},
		webhook: {
			handler: webhook,
			description: "Manage webhooks",
		},
		login: {
			handler: login,
			description: "Log in to Prismic",
		},
		logout: {
			handler: logout,
			description: "Log out of Prismic",
		},
		whoami: {
			handler: whoami,
			description: "Show the currently logged in user",
		},
	},
});

await main();

async function main(): Promise<void> {
	await initUpdateNotifier({
		npmPackageName: packageJson.name,
		statePath: UPDATE_NOTIFIER_STATE_PATH,
	});

	cleanupLegacyAuthFile().catch(() => {});

	let {
		positionals: [command],
		values: { version, help, repo = await safeGetRepositoryName() },
	} = parseArgs({
		options: {
			version: { type: "boolean", short: "v" },
			help: { type: "boolean", short: "h" },
			repo: { type: "string", short: "r" },
		},
		allowPositionals: true,
		strict: false,
	});

	if (version) {
		console.info(packageJson.version);
		return;
	}

	if (typeof repo !== "string") repo = "";

	if (!help) {
		setupSentry();
		await initSegment();

		if (repo) {
			segmentSetRepository(repo);
			sentrySetTag("repository", repo);
			sentrySetContext("Repository Data", { name: repo });
		}

		try {
			const adapter = await getAdapter();
			sentrySetTag("framework", adapter.id);
		} catch {
			// noop - it's okay if we can't set the framework
		}

		const token = await getToken();
		if (token) {
			const host = await getHost();
			const exp = decodePayload(token)?.exp;
			const now = Date.now() / 1000;

			if (!exp || exp - now <= 3600) {
				process.on("exit", () => spawnTokenRefresh());
			}

			if (!exp || exp > now) {
				getProfile({ token, host })
					.then((profile) => {
						segmentIdentify({ shortId: profile.shortId, intercomHash: profile.intercomHash });
						sentrySetUser({ id: profile.shortId });
					})
					.catch(() => {});
			}
		}

		if (command && !UNTRACKED_COMMANDS.includes(command)) {
			segmentTrackStart(command);
		}
	}

	try {
		await router();

		if (command && !UNTRACKED_COMMANDS.includes(command)) {
			segmentTrackEnd(command);
		}
	} catch (error) {
		process.exitCode = 1;

		if (error instanceof CommandError) {
			if (!UNTRACKED_COMMANDS.includes(command)) {
				segmentTrackEnd(command);
			}
			console.error(dedent(error.message));
			return;
		}

		if (error instanceof NoSupportedFrameworkError) {
			if (!UNTRACKED_COMMANDS.includes(command)) {
				segmentTrackEnd(command, { error });
			}
			console.error(error.message);
			return;
		}

		if (error instanceof UnauthorizedRequestError || error instanceof ForbiddenRequestError) {
			if (!UNTRACKED_COMMANDS.includes(command)) {
				segmentTrackEnd(command, { error });
			}
			console.error("Not logged in. Run `prismic login` first.");
			return;
		}

		if (error instanceof NotFoundRequestError) {
			if (!UNTRACKED_COMMANDS.includes(command)) {
				segmentTrackEnd(command);
			}
			console.error(
				error.message || "Not found. Verify the repository and any specified identifiers exist.",
			);
			return;
		}

		if (error instanceof InvalidPrismicConfigError) {
			if (!UNTRACKED_COMMANDS.includes(command)) {
				segmentTrackEnd(command);
			}
			console.error(`${error.message} Run \`prismic init\` to re-create a config.`);
			return;
		}

		if (error instanceof MissingPrismicConfigError) {
			if (!UNTRACKED_COMMANDS.includes(command)) {
				segmentTrackEnd(command);
			}
			console.error(`${error.message} Run \`prismic init\` to create a config.`);
			return;
		}

		if (error instanceof TypeBuilderRequiredError) {
			if (!UNTRACKED_COMMANDS.includes(command)) {
				segmentTrackEnd(command);
			}
			console.error(dedent`
				This command requires the Type Builder in your repository.

				As of March 2026, the Type Builder is rolling out incrementally as Slice
				Machine's replacement. Your repository may not have access yet. Continue using
				Slice Machine until your repository can upgrade.

				Learn more at https://prismic.io/docs/type-builder
			`);
			return;
		}

		if (!UNTRACKED_COMMANDS.includes(command)) {
			segmentTrackEnd(command, { error });
		}
		await sentryCaptureError(error);
		throw error;
	}
}
