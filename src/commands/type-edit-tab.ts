import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, updateCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic type edit-tab",
	description: "Edit a tab of a content type.",
	positionals: {
		name: { description: "Current name of the tab", required: true },
	},
	options: {
		in: { type: "string", required: true, description: "Name of the content type" },
		name: { type: "string", short: "n", description: "New name for the tab" },
		"with-slice-zone": { type: "boolean", description: "Add a slice zone to the tab" },
		"without-slice-zone": { type: "boolean", description: "Remove the slice zone from the tab" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [currentName] = positionals;
	const { in: typeName, repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const customTypes = await getCustomTypes({ repo, token, host });
	const type = customTypes.find((ct) => ct.label === typeName);

	if (!type) {
		throw new CommandError(`Type not found: ${typeName}`);
	}

	if (!(currentName in type.json)) {
		throw new CommandError(`Tab "${currentName}" not found in "${typeName}".`);
	}

	if ("with-slice-zone" in values && "without-slice-zone" in values) {
		throw new CommandError("Cannot use --with-slice-zone and --without-slice-zone together.");
	}

	if ("with-slice-zone" in values) {
		const tab = type.json[currentName];
		const hasSliceZone = Object.values(tab).some((field) => field.type === "Slices");

		if (hasSliceZone) {
			throw new CommandError(`Tab "${currentName}" already has a slice zone.`);
		}

		tab.slices = {
			type: "Slices",
			fieldset: "Slice Zone",
			config: { choices: {} },
		};
	}

	if ("without-slice-zone" in values) {
		const tab = type.json[currentName];
		const sliceZoneEntry = Object.entries(tab).find(([, field]) => field.type === "Slices");

		if (!sliceZoneEntry) {
			throw new CommandError(`Tab "${currentName}" does not have a slice zone.`);
		}

		const [sliceZoneId, sliceZoneField] = sliceZoneEntry;
		const choices =
			sliceZoneField.type === "Slices" ? (sliceZoneField.config?.choices ?? {}) : {};

		if (Object.keys(choices).length > 0) {
			throw new CommandError(
				`Cannot remove slice zone from "${currentName}": disconnect all slices first.`,
			);
		}

		delete tab[sliceZoneId];
	}

	if ("name" in values) {
		if (values.name! in type.json) {
			throw new CommandError(`Tab "${values.name}" already exists in "${typeName}".`);
		}

		const newJson: CustomType["json"] = {};
		for (const [key, value] of Object.entries(type.json)) {
			newJson[key === currentName ? values.name! : key] = value;
		}
		type.json = newJson;
	}

	try {
		await updateCustomType(type, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to update tab: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.updateCustomType(type);
	} catch {
		await adapter.createCustomType(type);
	}
	await adapter.generateTypes();

	console.info(`Tab updated: "${currentName}" in "${typeName}"`);
});
