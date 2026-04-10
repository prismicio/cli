import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getSlices, updateSlice } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice edit",
	description: "Edit a slice.",
	positionals: {
		id: { description: "ID of the slice", required: true },
	},
	options: {
		name: { type: "string", short: "n", description: "New name for the slice" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const slices = await getSlices({ repo, token, host });
	const slice = slices.find((s) => s.id === id);

	if (!slice) {
		throw new CommandError(`Slice not found: ${id}`);
	}

	const updatedSlice: SharedSlice = { ...slice };

	if ("name" in values) updatedSlice.name = values.name!;

	try {
		await updateSlice(updatedSlice, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to update slice: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.updateSlice(updatedSlice);
	} catch {
		await adapter.createSlice(updatedSlice);
	}
	await adapter.generateTypes();

	console.info(`Slice updated: "${updatedSlice.name}" (id: ${updatedSlice.id})`);
});
