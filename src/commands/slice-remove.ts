import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getSlices, removeSlice } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice remove",
	description: "Remove a slice.",
	positionals: {
		name: { description: "Name of the slice", required: true },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const slices = await getSlices({ repo, token, host });
	const slice = slices.find((s) => s.name === name);

	if (!slice) {
		throw new CommandError(`Slice not found: ${name}`);
	}

	try {
		await removeSlice(slice.id, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to remove slice: ${message}`);
		}
		throw error;
	}

	await adapter.syncModels({ repo, token, host });

	console.info(`Slice removed: "${name}" (id: ${slice.id})`);
});
