import type { DynamicWidget } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomType, getSlice, updateCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice connect",
	description: "Connect a slice to a type's slice zone.",
	sections: {
		EXAMPLES: `
			Connect a slice to a type's default slice zone:
			  prismic slice connect hero --to blog_post

			Connect to a named slice zone:
			  prismic slice connect hero --to blog_post --slice-zone page_slices
		`,
	},
	positionals: {
		id: { description: "ID of the slice", required: true },
	},
	options: {
		to: {
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
	const { to, "slice-zone": sliceZone = "slices", repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const apiConfig = { repo, token, host };

	const slice = await getSlice(id, apiConfig);
	const customType = await getCustomType(to, apiConfig);

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

	console.info(`Connected slice "${id}" to "${to}"`);
});
