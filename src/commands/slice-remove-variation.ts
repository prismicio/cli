import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getSlice, updateSlice } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice remove-variation",
	description: "Remove a variation from a slice.",
	positionals: {
		id: { description: "ID of the variation", required: true },
	},
	options: {
		from: { type: "string", required: true, description: "ID of the slice" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { from, repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const slice = await getSlice(from, { repo, token, host });

	const variation = slice.variations.find((v) => v.id === id);

	if (!variation) {
		throw new CommandError(`Variation "${id}" not found in slice "${from}".`);
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

	try {
		await adapter.updateSlice(updatedSlice);
	} catch {
		await adapter.createSlice(updatedSlice);
	}
	await adapter.generateTypes();

	console.info(`Removed variation "${id}" from slice "${from}"`);
});
