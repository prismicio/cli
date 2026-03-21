import { getHost, getToken } from "../auth";
import { setSimulatorUrl } from "../clients/core";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
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
		url: { description: "Simulator URL (e.g. https://example.com/slice-simulator)" },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [urlArg] = positionals;
	const { repo = await getRepositoryName() } = values;

	if (!urlArg) {
		throw new CommandError("Missing required argument: <url>");
	}

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

	const token = await getToken();
	const host = await getHost();

	try {
		await setSimulatorUrl(simulatorUrl, { repo, token, host });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to set simulator URL: ${message}`);
		}
		throw error;
	}

	console.info(`Simulator URL set: ${simulatorUrl}`);
});
