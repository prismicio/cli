import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";

const config = {
	name: "prismic page-type create",
	description: "Create a new page type.",
	positionals: {
		id: { description: "Page type ID", required: true },
	},
	options: {
		name: { type: "string", short: "n", description: "Page type name" },
		singleton: { type: "boolean", description: "Make the page type non-repeatable" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { name = id, singleton } = values;

	const adapter = await getAdapter();

	const model: CustomType = {
		id,
		label: name,
		format: "page",
		repeatable: !singleton,
		status: true,
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
						placeholder:
							"A title of the page used for social media and search engines",
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

	await adapter.createCustomType(model);
	await adapter.generateTypes();

	console.info(`Page type created: ${id}`);
});
