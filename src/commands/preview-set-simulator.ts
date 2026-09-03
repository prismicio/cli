import { getActiveRepositoryName } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { setSimulatorUrl } from "../lib/prismic/clients/core";

const config = {
	name: "prismic preview set-simulator",
	description: `
		Set the slice simulator URL for a Prismic repository.

		The Page Builder loads live slice previews from the simulator URL. Point it at
		the website that serves the /slice-simulator route: the local dev server
		during development, and the production domain after a deploy. A preview URL
		(\`prismic preview add\`) does not replace it.

		If the URL pathname does not end with /slice-simulator, it is appended
		automatically. You can pass the website URL alone.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		url: {
			description: "Website or simulator URL (e.g. https://example.com)",
			required: true,
		},
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
	const [urlArg] = positionals;
	const { env, repo = env ?? (await getActiveRepositoryName()) } = values;

	let parsed: URL;
	try {
		parsed = new URL(urlArg);
	} catch {
		throw new CommandError(`Invalid URL: ${urlArg}`);
	}

	if (!parsed.pathname.endsWith("/slice-simulator")) {
		parsed.pathname = parsed.pathname.replace(/\/+$/, "") + "/slice-simulator";
	}
	const simulatorUrl = parsed.toString();

	const { token, host } = await getCredentials();

	await setSimulatorUrl(simulatorUrl, { repo, token, host });

	console.info(`Simulator URL set: ${simulatorUrl}`);
});
