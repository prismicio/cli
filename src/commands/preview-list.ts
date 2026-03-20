import { getHost, getToken } from "../auth";
import { getPreviews, getSimulatorUrl } from "../clients/core";
import { parseCommand } from "../lib/command";
import { stringify } from "../lib/json";
import { getRepositoryName } from "../project";

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
		values: { repo = await getRepositoryName(), json },
	} = parseCommand({
		help: HELP,
		argv: process.argv.slice(4),
		options: {
			json: { type: "boolean" },
			repo: { type: "string", short: "r" },
		},
	});

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
