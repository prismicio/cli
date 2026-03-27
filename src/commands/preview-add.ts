import { getHost, getToken } from "../auth";
import { addPreview } from "../clients/core";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic preview add",
	description: `
		Add a preview configuration to a Prismic repository.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		url: { description: "Preview URL (e.g. https://example.com/api/preview)", required: true },
	},
	options: {
		name: { type: "string", short: "n", description: "Display name (defaults to hostname)" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [previewUrl] = positionals;
	const { repo = await getRepositoryName(), name } = values;

	let parsed: URL;
	try {
		parsed = new URL(previewUrl);
	} catch {
		throw new CommandError(`Invalid URL: ${previewUrl}`);
	}

	const displayName = name || parsed.hostname;
	const websiteURL = `${parsed.protocol}//${parsed.host}`;
	const resolverPath = parsed.pathname === "/" ? undefined : parsed.pathname;

	const token = await getToken();
	const host = await getHost();

	try {
		await addPreview({ name: displayName, websiteURL, resolverPath }, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to add preview: ${message}`);
		}
		throw error;
	}

	console.info(`Preview added: ${previewUrl}`);
});
