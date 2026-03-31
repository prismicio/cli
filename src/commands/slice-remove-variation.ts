import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getSlices, updateSlice } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice remove-variation",
	description: "Remove a variation from a slice.",
	positionals: {
		name: { description: "Name of the variation", required: true },
	},
	options: {
		from: { type: "string", required: true, description: "Name of the slice" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { from, repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const slices = await getSlices({ repo, token, host });
	const slice = slices.find((s) => s.name === from);

	if (!slice) {
		throw new CommandError(`Slice not found: ${from}`);
	}

	const variation = slice.variations.find((v) => v.name === name);

	if (!variation) {
		throw new CommandError(`Variation "${name}" not found in slice "${from}".`);
	}

	const updatedSlice: SharedSlice = {
		...slice,
		variations: slice.variations.filter((v) => v.id !== variation.id),
	};

	try {
		await updateSlice(updatedSlice, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to remove variation: ${message}`);
		}
		throw error;
	}

	await adapter.syncModels({ repo, token, host });

	console.info(`Removed variation "${name}" from slice "${from}"`);
});
