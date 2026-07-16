import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getPreviews, removePreview } from "../lib/prismic/clients/core";

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
		env: { type: "string", short: "e", description: "(deprecated) Alias for --repo" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [previewUrl] = positionals;
	const {
		env,
		repo = env ?? (await getActiveRepositoryName()),
	} = values;

	const { token, host } = await getCredentials();

	const previews = await getPreviews({ repo, token, host });

	const preview = previews.find((p) => p.url === previewUrl);
	if (!preview) {
		throw new CommandError(`Preview not found: ${previewUrl}`);
	}

	await removePreview(preview.id, { repo, token, host });

	console.info(`Preview removed: ${previewUrl}`);
});
