import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { snakeCase } from "change-case";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { insertCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic type create",
	description: "Create a new content type.",
	positionals: {
		name: { description: "Name of the content type", required: true },
	},
	options: {
		format: {
			type: "string",
			short: "f",
			description: 'Type format: "custom" (default) or "page"',
		},
		single: { type: "boolean", short: "s", description: "Allow only one document of this type" },
		id: { type: "string", description: "Custom ID for the content type" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
	sections: {
		FORMATS: `
			custom   A non-page type (e.g. settings, navigation, author, blog
			         category). This is the default.
			page     A page type with a URL (e.g. homepage, blog post, landing
			         page). Includes a slice zone and SEO & Metadata tab by
			         default, and configures a route in prismic.config.json.
		`,
		EXAMPLES: `
			Create a page type:
			  prismic type create "Blog Post" --format page

			Create a singleton custom type:
			  prismic type create Settings --single

			Create with a custom ID:
			  prismic type create "Landing Page" --format page --id landing
		`,
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const {
		format = "custom",
		single = false,
		id = snakeCase(name),
		repo = await getRepositoryName(),
	} = values;

	if (format !== "custom" && format !== "page") {
		throw new CommandError(`Invalid format: "${format}". Use "custom" or "page".`);
	}

	const json: CustomType["json"] =
		format === "page"
			? {
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
				}
			: { Main: {} };

	const model: CustomType = {
		id,
		label: name,
		repeatable: !single,
		status: true,
		format,
		json,
	};

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();

	try {
		await insertCustomType(model, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to create type: ${message}`);
		}
		throw error;
	}

	await adapter.createCustomType(model);
	await adapter.generateTypes();

	console.info(`Created type "${name}" (id: "${id}", format: "${format}")`);
	console.info(`Run \`prismic field add <type> --to-type ${id}\` to add fields.`);
	console.info(`Run \`prismic type view ${id}\` to view the type.`);
});
