import { pathToFileURL } from "node:url";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { UnsupportedFileTypeError, uploadScreenshot } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { readURLFile } from "../lib/file";
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
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { "from-slice": sliceId, screenshot } = values;

	const adapter = await getAdapter();
	const { model: slice } = await adapter.getSlice(sliceId);

	const variation = slice.variations.find((v) => v.id === id);
	if (!variation) {
		throw new CommandError(`Variation "${id}" not found in slice "${sliceId}".`);
	}

	if ("name" in values) variation.name = values.name!;

	if (screenshot) {
		const repo = await getRepositoryName();
		const token = await getToken();
		const host = await getHost();

		const url = /^https?:\/\//i.test(screenshot) ? new URL(screenshot) : pathToFileURL(screenshot);
		const blob = await readURLFile(url);
		let screenshotUrl;
		try {
			screenshotUrl = await uploadScreenshot(blob, {
				sliceId: slice.id,
				variationId: variation.id,
				repo,
				token,
				host,
			});
		} catch (error) {
			if (error instanceof UnsupportedFileTypeError) {
				throw new CommandError(error.message);
			}
			throw error;
		}
		variation.imageUrl = screenshotUrl.toString();
	}

	await adapter.updateSlice(slice);
	await adapter.generateTypes();

	console.info(`Variation updated: "${id}" in slice "${sliceId}"`);
});
