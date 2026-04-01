import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { snakeCase } from "change-case";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { insertCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic page-type create",
	description: "Create a new page type.",
	positionals: {
		name: { description: "Name of the page type", required: true },
	},
	options: {
		single: { type: "boolean", short: "s", description: "Allow only page one of this type" },
		id: { type: "string", description: "Custom ID for the page type" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { single = false, id = snakeCase(name), repo = await getRepositoryName() } = values;

	const model: CustomType = {
		id,
		label: name,
		repeatable: !single,
		status: true,
		format: "page",
		json: {
			Main: {
				slices: {
					type: "Slices",
					fieldset: "Slice Zone",
					config: { choices: {} },
				},
			},
			"SEO & Metadata": {
				meta_title: {
					type: "Text",
					config: {
						label: "Meta Title",
						placeholder: "A title of the page used for social media and search engines",
					},
				},
				meta_description: {
					type: "Text",
					config: {
						label: "Meta Description",
						placeholder: "A brief summary of the page",
					},
				},
				meta_image: {
					type: "Image",
					config: {
						label: "Meta Image",
						constraint: { width: 2400, height: 1260 },
						thumbnails: [],
					},
				},
			},
		},
	};

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();

	try {
		await insertCustomType(model, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to create page type: ${message}`);
		}
		throw error;
	}

	await adapter.createCustomType(model);
	await adapter.generateTypes();

	console.info(`Created page type "${name}" (id: "${id}")`);
});
