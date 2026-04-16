import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { snakeCase } from "change-case";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { insertSlice } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { flushLogs, formatChanges } from "../lib/logger";
import { UnknownRequestError } from "../lib/request";
import { findProjectRoot, getRepositoryName } from "../project";

const config = {
	name: "prismic slice create",
	description: "Create a new slice.",
	positionals: {
		name: { description: "Name of the slice", required: true },
	},
	options: {
		id: { type: "string", description: "Custom ID for the slice" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { id = snakeCase(name), repo = await getRepositoryName() } = values;

	const model: SharedSlice = {
		id,
		name,
		type: "SharedSlice",
		variations: [
			{
				id: "default",
				name: "Default",
				description: "Default",
				docURL: "",
				imageUrl: "",
				version: "",
				primary: {},
			},
		],
	};

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();

	try {
		await insertSlice(model, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to create slice: ${message}`);
		}
		throw error;
	}
	await adapter.createSlice(model);
	await adapter.generateTypes();

	const projectRoot = await findProjectRoot();
	console.info(
		formatChanges(flushLogs(), {
			title: `Created slice "${name}" (ID: ${id})`,
			root: projectRoot,
		}),
	);
});
