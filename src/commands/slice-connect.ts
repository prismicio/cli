import type { DynamicWidget } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, getSlices, updateCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice connect",
	description: "Connect a slice to a type's slice zone.",
	positionals: {
		name: { description: "Name of the slice", required: true },
	},
	options: {
		to: {
			type: "string",
			required: true,
			description: "Name of the page type or custom type",
		},
		"slice-zone": {
			type: "string",
			description: 'Slice zone field ID (default: "slices")',
		},
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { to, "slice-zone": sliceZone = "slices", repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const apiConfig = { repo, token, host };

	const slices = await getSlices(apiConfig);
	const slice = slices.find((s) => s.name === name);
	if (!slice) {
		throw new CommandError(`Slice not found: ${name}`);
	}

	const customTypes = await getCustomTypes(apiConfig);
	const customType = customTypes.find((ct) => ct.label === to);
	if (!customType) {
		throw new CommandError(`Type not found: ${to}`);
	}

	const allFields: Record<string, DynamicWidget> = Object.assign(
		{},
		...Object.values(customType.json),
	);

	const sliceZoneField = allFields[sliceZone];
	if (!sliceZoneField || sliceZoneField.type !== "Slices") {
		throw new CommandError(`Slice zone "${sliceZone}" not found in "${to}".`);
	}

	sliceZoneField.config ??= {};
	sliceZoneField.config.choices ??= {};

	if (slice.id in sliceZoneField.config.choices) {
		throw new CommandError(
			`Slice "${slice.id}" is already connected to "${to}" in slice zone "${sliceZone}".`,
		);
	}

	sliceZoneField.config.choices[slice.id] = { type: "SharedSlice" };

	try {
		await updateCustomType(customType, apiConfig);
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to connect slice: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.updateCustomType(customType);
	} catch {
		await adapter.createCustomType(customType);
	}
	await adapter.generateTypes();

	console.info(`Connected slice "${name}" to "${to}"`);
});
