import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomType, updateCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { NotFoundRequestError, UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic type edit-tab",
	description: "Edit a tab of a content type.",
	positionals: {
		name: { description: "Current name of the tab", required: true },
	},
	options: {
		"from-type": { type: "string", required: true, description: "ID of the content type" },
		name: { type: "string", short: "n", description: "New name for the tab" },
		"with-slice-zone": { type: "boolean", description: "Add a slice zone to the tab" },
		"without-slice-zone": { type: "boolean", description: "Remove the slice zone from the tab" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [currentName] = positionals;
	const { "from-type": typeId, repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	let customType;
	try {
		customType = await getCustomType(typeId, { repo, token, host });
	} catch (error) {
		if (error instanceof NotFoundRequestError) throw new CommandError(`Type not found: ${typeId}`);
		throw error;
	}

	if (!(currentName in customType.json)) {
		throw new CommandError(`Tab "${currentName}" not found in "${typeId}".`);
	}

	if ("with-slice-zone" in values && "without-slice-zone" in values) {
		throw new CommandError("Cannot use --with-slice-zone and --without-slice-zone together.");
	}

	if ("with-slice-zone" in values) {
		const tab = customType.json[currentName];
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
		const tab = customType.json[currentName];
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
		if (values.name! in customType.json) {
			throw new CommandError(`Tab "${values.name}" already exists in "${typeId}".`);
		}

		const newJson: CustomType["json"] = {};
		for (const [key, value] of Object.entries(customType.json)) {
			newJson[key === currentName ? values.name! : key] = value;
		}
		customType.json = newJson;
	}

	try {
		await updateCustomType(customType, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to update tab: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.updateCustomType(customType);
	} catch {
		await adapter.createCustomType(customType);
	}
	await adapter.generateTypes();

	console.info(`Tab updated: "${currentName}" in "${typeId}"`);
});
