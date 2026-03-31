import { getHost, getToken } from "../auth";
import { getSlices } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice view",
	description: "View details of a slice.",
	positionals: {
		name: { description: "Name of the slice", required: true },
	},
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { json, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const slices = await getSlices({ repo, token, host });
	const slice = slices.find((slice) => slice.name === name);

	if (!slice) {
		throw new CommandError(`Slice not found: ${name}`);
	}

	if (json) {
		console.info(stringify(slice));
		return;
	}

	console.info(`ID: ${slice.id}`);
	console.info(`Name: ${slice.name}`);
	const variations = slice.variations?.map((v) => v.id).join(", ") || "(none)";
	console.info(`Variations: ${variations}`);
});
