import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";

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
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [currentName] = positionals;
	const { "from-type": typeId } = values;

	const adapter = await getAdapter();
	const { model: customType } = await adapter.getCustomType(typeId);

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
		const choices = sliceZoneField.type === "Slices" ? (sliceZoneField.config?.choices ?? {}) : {};

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

	await adapter.updateCustomType(customType);
	await adapter.generateTypes();

	console.info(`Tab updated: "${currentName}" in "${typeId}"`);
});
