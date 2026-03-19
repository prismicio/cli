import { parseArgs } from "node:util";

import { getHost, getToken } from "../auth";
import { getPreviews, removePreview } from "../clients/preview";
import { UnknownRequestError } from "../lib/request";
import { safeGetRepositoryName } from "../project";

const HELP = `
Remove a preview configuration from a Prismic repository.

By default, this command reads the repository from prismic.config.json at the
project root.

USAGE
  prismic preview remove <url> [flags]

ARGUMENTS
  <url>   Preview URL to remove

FLAGS
  -r, --repo string   Repository domain
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic <command> <subcommand> --help\` for more information about a command.
`.trim();

export async function previewRemove(): Promise<void> {
	const {
		values: { help, repo = await safeGetRepositoryName() },
		positionals: [previewUrl],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "preview", "remove"
		options: {
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!previewUrl) {
		console.error("Missing required argument: <url>");
		process.exitCode = 1;
		return;
	}

	if (!repo) {
		console.error("Missing prismic.config.json or --repo option");
		process.exitCode = 1;
		return;
	}

	const token = await getToken();
	const host = await getHost();

	const previews = await getPreviews({ repo, token, host });
	const preview = previews.find((p) => p.url === previewUrl);
	if (!preview) {
		console.error(`Preview not found: ${previewUrl}`);
		process.exitCode = 1;
		return;
	}

	try {
		await removePreview(preview.id, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			console.error(`Failed to remove preview: ${message}`);
			process.exitCode = 1;
			return;
		}
		throw error;
	}

	console.info(`Preview removed: ${previewUrl}`);
}
