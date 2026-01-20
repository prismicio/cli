import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { ForbiddenRequestError, request } from "./lib/request";
import { getUserServiceUrl } from "./lib/url";

const HELP = `
Show the currently logged in user.

USAGE
  prismic whoami [flags]

FLAGS
  -h, --help   Show help for command

LEARN MORE
  Use \`prismic <command> --help\` for more information about a command.
`.trim();

export async function whoami(): Promise<void> {
	const {
		values: { help },
	} = parseArgs({
		args: process.argv.slice(3),
		options: { help: { type: "boolean", short: "h" } },
	});

	if (help) {
		console.info(HELP);
		return;
	}

	const authenticated = await isAuthenticated();
	if (!authenticated) {
		handleUnauthenticated();
		return;
	}

	const response = await getProfile();
	if (!response.ok) {
		if (response.error instanceof ForbiddenRequestError) {
			handleUnauthenticated();
		} else {
			console.error("Failed to fetch user profile.");
		}
		process.exitCode = 1;
		return;
	}

	console.info(response.value.email);
}

async function getProfile() {
	const url = new URL("profile", await getUserServiceUrl());
	return await request(url, { schema: v.object({ email: v.string() }) });
}

function handleUnauthenticated() {
	console.error("Not logged in. Run `prismic login` first.");
	process.exitCode = 1;
}
