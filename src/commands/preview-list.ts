import { parseArgs } from "node:util";

import { getHost, getToken } from "../auth";
import { getPreviews, getSimulatorUrl } from "../clients/core";
import { stringify } from "../lib/json";
import { safeGetRepositoryName } from "../project";

const HELP = `
List all preview configurations in a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic preview list [flags]

FLAGS
      --json          Output as JSON
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function previewList(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryName(), json },
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "preview", "list"
		options: {
			json: { type: "boolean" },
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: false,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!repo) {
		console.error("Missing prismic.config.json or --repo option");
		process.exitCode = 1;
		return;
	}

	const token = await getToken();
	const host = await getHost();

	const [previews, simulatorUrl] = await Promise.all([
		getPreviews({ repo, token, host }),
		getSimulatorUrl({ repo, token, host }),
	]);

	if (json) {
		console.info(
			stringify({
				previews,
				simulatorUrl: simulatorUrl ?? null,
			}),
		);
		return;
	}

	if (previews.length === 0 && !simulatorUrl) {
		console.info("No preview configurations found.");
		return;
	}

	for (const preview of previews) {
		console.info(`${preview.url}  ${preview.label}`);
	}

	if (simulatorUrl) {
		console.info(`\nSimulator: ${simulatorUrl}`);
	}
}
