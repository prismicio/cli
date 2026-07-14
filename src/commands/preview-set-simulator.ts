import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { setSimulatorUrl } from "../lib/prismic/clients/core";
import { resolveEnvironment } from "../lib/prismic/environments";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic preview set-simulator",
	description: `
		Set the slice simulator URL for a Prismic repository.

		If the URL pathname does not end with /slice-simulator, it is appended
		automatically.

		By default, this command reads the repository from prismic.config.json at the
		project root.
	`,
	positionals: {
		url: {
			description: "Simulator URL (e.g. https://example.com/slice-simulator)",
			required: true,
		},
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
		env: { type: "string", short: "e", description: "Environment domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [urlArg] = positionals;
	const { repo: parentRepo = await getRepositoryName(), env } = values;

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
	const repo = env ? await resolveEnvironment(env, { repo: parentRepo, token, host }) : parentRepo;

	await setSimulatorUrl(simulatorUrl, { repo, token, host });

	console.info(`Simulator URL set: ${simulatorUrl}`);
});
