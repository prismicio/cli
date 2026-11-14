import { getActiveRepositoryName, getAdapter, NoSupportedFrameworkError } from "../adapters";
import { getHost, getToken, onUnauthorized } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { MissingPackageJson } from "../lib/packageJson";
import { addPreview, getSimulatorUrl } from "../lib/prismic/client";

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

	const host = await getHost();

	await addPreview(
		{ name: displayName, websiteURL, resolverPath },
		{ repo, getToken, host, onUnauthorized },
	);

	console.info(`Preview added: ${previewUrl}`);

	// A repository has one simulator URL but can have many previews, so this is only a hint.
	const { simulator_url: simulatorUrl } = await getSimulatorUrl({
		repo,
		getToken,
		host,
		onUnauthorized,
	});
	if (!simulatorUrl) {
		const suggestedUrl = new URL("/slice-simulator", parsed.origin);
		console.info(
			`NOTE: The repository has no simulator URL. You can set it with:\n  prismic preview set-simulator ${suggestedUrl}`,
		);
	} else if (URL.canParse(simulatorUrl)) {
		const simulator = new URL(simulatorUrl);
		if (simulator.host !== parsed.host) {
			const suggestedUrl = new URL(simulator.pathname, parsed.origin);
			console.info(
				`NOTE: The Page Builder loads slice previews from the simulator URL, which is still ${simulatorUrl}. If this preview is for production, update it with:\n  prismic preview set-simulator ${suggestedUrl}`,
			);
		}
	}

	// A preview URL is useless until setup is finished, for example until the website renders the preview component.
	try {
		const adapter = await getAdapter();
		const setupInstructions = await adapter.getSetupInstructions();
		if (setupInstructions) console.info(`\n${setupInstructions}`);
	} catch (error) {
		// The command works without a local project.
		if (!(error instanceof NoSupportedFrameworkError || error instanceof MissingPackageJson)) {
			throw error;
		}
	}
});
