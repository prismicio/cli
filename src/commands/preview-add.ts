import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { addPreview } from "../lib/prismic/clients/core";

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
		repo: { type: "string", short: "r", description: "Repository or environment domain" },
		env: { type: "string", short: "e", description: "(deprecated) Alias for --repo" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [previewUrl] = positionals;
	const {
		env,
		repo = env ?? (await getActiveRepositoryName()),
		name,
	} = values;

	let parsed: URL;
	try {
		parsed = new URL(previewUrl);
	} catch {
		throw new CommandError(`Invalid URL: ${previewUrl}`);
	}

	const displayName = name || parsed.hostname;
	const websiteURL = `${parsed.protocol}//${parsed.host}`;
	const resolverPath = parsed.pathname === "/" ? undefined : parsed.pathname;

	const { token, host } = await getCredentials();

	await addPreview({ name: displayName, websiteURL, resolverPath }, { repo, token, host });

	console.info(`Preview added: ${previewUrl}`);
	console.info("Run `prismic preview set-simulator <url>` to set the slice simulator URL.");
});
