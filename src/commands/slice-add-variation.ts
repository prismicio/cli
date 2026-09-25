import { pathToFileURL } from "node:url";

import { camelCase } from "change-case";

import { getAdapter } from "../adapters";
import { getCredentials } from "../auth";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { readURLFile } from "../lib/file";
import { uploadScreenshot } from "../lib/prismic/clients/custom-types";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice add-variation",
	description: `
		Add a variation to a slice.

		Run \`prismic docs view slices#slice-variations\` for details.
	`,
	positionals: {
		name: { description: "Name of the variation", required: true },
	},
	options: {
		to: { type: "string", required: true, description: "ID of the slice" },
		id: { type: "string", description: "Custom ID for the variation" },
		screenshot: { type: "string", short: "s", description: "Screenshot image file path or URL" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals: [name], values }) => {
	const { to, id = camelCase(name), screenshot } = values;

	const adapter = await getAdapter();
	const { model: slice } = await adapter.getSlice(to);

	if (slice.variations.some((v) => v.id === id)) {
		throw new CommandError(`Variation "${id}" already exists in slice "${to}".`);
	}

	let imageUrl = "";
	if (screenshot) {
		const repo = await getRepositoryName();
		const { token, host } = await getCredentials();

		const url = /^https?:\/\//i.test(screenshot) ? new URL(screenshot) : pathToFileURL(screenshot);
		const blob = await readURLFile(url);
		const screenshotUrl = await uploadScreenshot(blob, {
			sliceId: slice.id,
			variationId: id,
			repo,
			token,
			host,
		});
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
