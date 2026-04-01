import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { snakeCase } from "change-case";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { insertCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic custom-type create",
	description: "Create a new custom type.",
	positionals: {
		name: { description: "Name of the custom type", required: true },
	},
	options: {
		single: { type: "boolean", short: "s", description: "Allow only one of this type" },
		id: { type: "string", description: "Custom ID for the custom type" },
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
		format: "custom",
		json: {
			Main: {},
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
			throw new CommandError(`Failed to create custom type: ${message}`);
		}
		throw error;
	}

	await adapter.createCustomType(model);
	await adapter.generateTypes();

	console.info(`Created custom type "${name}" (id: "${id}")`);
});
