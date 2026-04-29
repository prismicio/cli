import { camelCase } from "change-case";
import { pathToFileURL } from "node:url";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { UnsupportedFileTypeError, uploadScreenshot } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { readURLFile } from "../lib/file";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice add-variation",
	description: "Add a variation to a slice.",
	positionals: {
		name: { description: "Name of the variation", required: true },
	},
	options: {
		to: { type: "string", required: true, description: "ID of the slice" },
		id: { type: "string", description: "Custom ID for the variation" },
		screenshot: { type: "string", short: "s", description: "Screenshot image file path or URL" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { to, id = camelCase(name), screenshot } = values;

	const adapter = await getAdapter();
	const { model: slice } = await adapter.getSlice(to);

	if (slice.variations.some((v) => v.id === id)) {
		throw new CommandError(`Variation "${id}" already exists in slice "${to}".`);
	}

	let imageUrl = "";
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
				variationId: id,
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
		imageUrl = screenshotUrl.toString();
	}

	slice.variations = [
		...slice.variations,
		{
			id,
			name,
			description: name,
			docURL: "",
			imageUrl,
			version: "",
			primary: {},
		},
	];

	await adapter.updateSlice(slice);
	await adapter.generateTypes();

	console.info(`Added variation "${name}" (id: "${id}") to slice "${to}"`);
});
