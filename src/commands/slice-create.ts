import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { snakeCase } from "change-case";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { completeOnboardingStepsSilently } from "../clients/repository";
import { createCommand, type CommandConfig } from "../lib/command";
import { readConfig } from "../project";

const config = {
	name: "prismic slice create",
	description: "Create a new slice.",
	positionals: {
		name: { description: "Name of the slice", required: true },
	},
	options: {
		id: { type: "string", description: "Custom ID for the slice" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { id = snakeCase(name) } = values;

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
	await adapter.createSlice(model);
	await adapter.generateTypes();

	try {
		const [{ repositoryName }, token, host] = await Promise.all([
			readConfig(),
			getToken(),
			getHost(),
		]);
		await completeOnboardingStepsSilently({
			repo: repositoryName,
			token,
			host,
			stepIds: ["createSlice"],
		});
	} catch {}

	console.info(`Created slice "${name}" (id: "${id}")`);
	console.info(`Run \`prismic field add <type> --to-slice ${id}\` to add fields.`);
	console.info(`Run \`prismic slice connect ${id} --to <type>\` to connect the slice to a type.`);
});
