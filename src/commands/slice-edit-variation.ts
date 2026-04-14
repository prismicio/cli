import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getSlice, updateSlice, uploadScreenshot } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice edit-variation",
	description: "Edit a variation of a slice.",
	positionals: {
		id: { description: "ID of the variation", required: true },
	},
	options: {
		"from-slice": { type: "string", required: true, description: "ID of the slice" },
		name: { type: "string", short: "n", description: "New name for the variation" },
		screenshot: { type: "string", short: "s", description: "Screenshot image file path or URL" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { "from-slice": sliceId, repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const slice = await getSlice(sliceId, { repo, token, host });

	const variation = slice.variations.find((v) => v.id === id);

	if (!variation) {
		throw new CommandError(`Variation "${id}" not found in slice "${sliceId}".`);
	}

	if ("name" in values) variation.name = values.name!;

	if (values.screenshot) {
		variation.imageUrl = await uploadScreenshot(values.screenshot, {
			repo,
			sliceId: sliceId,
			variationId: id,
			token,
			host,
		});
	}

	const updatedSlice: SharedSlice = { ...slice };

	try {
		await updateSlice(updatedSlice, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to update variation: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.updateSlice(updatedSlice);
	} catch {
		await adapter.createSlice(updatedSlice);
	}
	await adapter.generateTypes();

	console.info(`Variation updated: "${id}" in slice "${sliceId}"`);
});
