import { getHost, getToken } from "../auth";
import { getPreviews, removePreview } from "../clients/core";
import { CommandError, parseCommand } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

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
		values: { repo = await getRepositoryName() },
		positionals: [previewUrl],
	} = parseCommand({
		help: HELP,
		argv: process.argv.slice(4),
		options: {
			repo: { type: "string", short: "r" },
		},
		allowPositionals: true,
	});

	if (!previewUrl) {
		throw new CommandError("Missing required argument: <url>");
	}

	const token = await getToken();
	const host = await getHost();

	const previews = await getPreviews({ repo, token, host });
	const preview = previews.find((p) => p.url === previewUrl);
	if (!preview) {
		throw new CommandError(`Preview not found: ${previewUrl}`);
	}

	try {
		await removePreview(preview.id, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to remove preview: ${message}`);
		}
		throw error;
	}

	console.info(`Preview removed: ${previewUrl}`);
}
