import { getHost, getToken } from "../auth";
import { getPreviews, removePreview } from "../clients/core";
import { resolveEnvironment } from "../environments";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

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
		repo: { type: "string", short: "r", description: "Repository domain" },
		env: { type: "string", short: "e", description: "Environment domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [previewUrl] = positionals;
	const { repo: parentRepo = await getRepositoryName(), env } = values;

	const token = await getToken();
	const host = await getHost();
	const repo = env ? await resolveEnvironment(env, { repo: parentRepo, token, host }) : parentRepo;

	let previews;
	try {
		previews = await getPreviews({ repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to remove preview: ${message}`);
		}
		throw error;
	}

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
});
