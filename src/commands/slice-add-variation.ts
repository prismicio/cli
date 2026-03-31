import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { camelCase } from "change-case";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getSlices, updateSlice } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice add-variation",
	description: "Add a variation to a slice.",
	positionals: {
		name: { description: "Name of the variation", required: true },
	},
	options: {
		to: { type: "string", required: true, description: "Name of the slice" },
		id: { type: "string", description: "Custom ID for the variation" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { to, id = camelCase(name), repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const slices = await getSlices({ repo, token, host });
	const slice = slices.find((s) => s.name === to);

	if (!slice) {
		throw new CommandError(`Slice not found: ${to}`);
	}

	if (slice.variations.some((v) => v.id === id)) {
		throw new CommandError(`Variation "${id}" already exists in slice "${to}".`);
	}

	const updatedSlice: SharedSlice = {
		...slice,
		variations: [
			...slice.variations,
			{
				id,
				name,
				description: name,
				docURL: "",
				imageUrl: "",
				version: "",
				primary: {},
			},
		],
	};

	try {
		await updateSlice(updatedSlice, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to add variation: ${message}`);
		}
		throw error;
	}

	await adapter.syncModels({ repo, token, host });

	console.info(`Added variation "${name}" (id: "${id}") to slice "${to}"`);
});
