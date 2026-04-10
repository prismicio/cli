import type { DynamicWidget } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices, updateCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice disconnect",
	description: "Disconnect a slice from a type's slice zone.",
	positionals: {
		id: { description: "ID of the slice", required: true },
	},
	options: {
		from: {
			type: "string",
			required: true,
			description: "ID of the content type",
		},
		"slice-zone": {
			type: "string",
			description: 'Slice zone field ID (default: "slices")',
		},
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { from, "slice-zone": sliceZone = "slices", repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const apiConfig = { repo, token, host };

	const slices = await getSlices(apiConfig);
	const slice = slices.find((s) => s.id === id);
	if (!slice) {
		throw new CommandError(`Slice not found: ${id}`);
	}

	const customTypes = await getCustomTypes(apiConfig);
	const customType = customTypes.find((ct) => ct.id === from);
	if (!customType) {
		throw new CommandError(`Type not found: ${from}`);
	}

	const allFields: Record<string, DynamicWidget> = Object.assign(
		{},
		...Object.values(customType.json),
	);

	const sliceZoneField = allFields[sliceZone];
	if (!sliceZoneField || sliceZoneField.type !== "Slices") {
		throw new CommandError(`Slice zone "${sliceZone}" not found in "${from}".`);
	}

	if (!sliceZoneField.config?.choices || !(slice.id in sliceZoneField.config.choices)) {
		throw new CommandError(
			`Slice "${slice.id}" is not connected to "${from}" in slice zone "${sliceZone}".`,
		);
	}

	delete sliceZoneField.config.choices[slice.id];

	try {
		await updateCustomType(customType, apiConfig);
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to disconnect slice: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.updateCustomType(customType);
	} catch {
		await adapter.createCustomType(customType);
	}
	await adapter.generateTypes();

	console.info(`Disconnected slice "${id}" from "${from}"`);
});
