import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { addPreview } from "../lib/prismic/clients/core";

const config = {
	name: "prismic preview add",
	description: `
		Add a preview URL to a Prismic repository.

		A preview URL lets writers browse the website with draft content. It does not
		enable live slice previews in the Page Builder. A website needs both a preview
		URL and a simulator URL. After you add the preview URL, set the simulator URL
		for the same website with \`prismic preview set-simulator\`.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		url: { description: "Preview URL (e.g. https://example.com/api/preview)", required: true },
	},
	options: {
		name: { type: "string", short: "n", description: "Display name (defaults to hostname)" },
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
	const { env, repo = env ?? (await getActiveRepositoryName()), name } = values;

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
	console.info("");
	console.info("Next:");
	console.info(
		`  prismic preview set-simulator ${websiteURL}  # the Page Builder loads live slice previews from this URL`,
	);
});
