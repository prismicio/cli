import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { deletePreview, getPreviews } from "../lib/prismic/client";

const config = {
	name: "prismic preview remove",
	description: `
		Remove a preview configuration from a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		url: { description: "Preview URL to remove", required: true },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: {
			type: "string",
			short: "e",
			description: "Alias for --repo",
			deprecated: "Use `prismic env` or --repo instead.",
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [previewUrl] = positionals;
	const { env, repo = env ?? (await getActiveRepositoryName()) } = values;

	const { host, getToken } = await getCredentials();

	const { results: previews } = await getPreviews({ repo, host, getToken });

	const preview = previews.find((p) => p.url === previewUrl);
	if (!preview) {
		throw new CommandError(`Preview not found: ${previewUrl}`);
	}

	await deletePreview(preview.id, { repo, host, getToken });

	console.info(`Preview removed: ${previewUrl}`);
});
