import type { DynamicWidget } from "@prismicio/types-internal/lib/customtypes";

import type { CommandConfig } from "./lib/command";

import { getCustomTypes, getSlices, updateCustomType, updateSlice } from "./clients/custom-types";
import { CommandError } from "./lib/command";
import { UnknownRequestError } from "./lib/request";

type Field = DynamicWidget;
type Fields = Record<string, Field>;
type EntityType = "slice" | "customType";
type ApiConfig = { repo: string; token: string | undefined; host: string };
type Target = [fields: Fields, save: () => Promise<void>, entityType: EntityType];

export const TARGET_OPTIONS = {
	"to-slice": { type: "string", description: "Name of the target slice" },
	"to-page-type": { type: "string", description: "Name of the target page type" },
	"to-custom-type": { type: "string", description: "Name of the target custom type" },
	variation: { type: "string", description: 'Slice variation ID (default: "default")' },
	tab: { type: "string", description: 'Custom type tab name (default: "Main")' },
	repo: { type: "string", short: "r", description: "Repository domain" },
} satisfies CommandConfig["options"];

export const SOURCE_OPTIONS = {
	"from-slice": { type: "string", description: "Name of the source slice" },
	"from-page-type": { type: "string", description: "Name of the source page type" },
	"from-custom-type": { type: "string", description: "Name of the source custom type" },
	variation: TARGET_OPTIONS.variation,
	tab: TARGET_OPTIONS.tab,
	repo: TARGET_OPTIONS.repo,
} satisfies CommandConfig["options"];

export async function resolveFieldContainer(
	id: string,
	values: {
		"from-slice"?: string;
		"from-page-type"?: string;
		"from-custom-type"?: string;
		variation?: string;
	},
	apiConfig: ApiConfig,
): Promise<Target> {
	const {
		"from-slice": fromSlice,
		"from-page-type": fromPageType,
		"from-custom-type": fromCustomType,
		variation: variationId = "default",
	} = values;

	const providedCount = [fromSlice, fromPageType, fromCustomType].filter(Boolean).length;
	if (providedCount === 0) {
		throw new CommandError(
			"Specify a target with --from-slice, --from-page-type, or --from-custom-type.",
		);
	}
	if (providedCount > 1) {
		throw new CommandError(
			"Only one of --from-slice, --from-page-type, or --from-custom-type can be specified.",
		);
	}

	if (fromSlice) {
		const slices = await getSlices(apiConfig);
		const slice = slices.find((s) => s.name === fromSlice);
		if (!slice) {
			throw new CommandError(`Slice not found: ${fromSlice}`);
		}
		const variation = slice.variations.find((v) => v.id === variationId);
		if (!variation) {
			const variationIds = slice.variations?.map((v) => v.id).join(", ") || "(none)";
			throw new CommandError(`Variation "${variation}" not found. Available: ${variationIds}`);
		}
		variation.primary ??= {};
		resolveFieldTarget(variation.primary, id);
		return [variation.primary, () => updateSlice(slice, apiConfig), "slice"];
	}

	const fromType = fromPageType || fromCustomType;
	const entityLabel = fromPageType ? "Page type" : "Custom type";
	const customTypes = await getCustomTypes(apiConfig);
	const customType = customTypes.find((ct) => {
		if (ct.label !== fromType) return false;
		return fromPageType ? ct.format === "page" : ct.format !== "page";
	});
	if (!customType) {
		throw new CommandError(`${entityLabel} not found: ${fromType}`);
	}
	let tab: Record<string, DynamicWidget> | undefined;
	for (const tabName in customType.json) {
		if (id in customType.json[tabName]) tab = customType.json[tabName];
	}
	if (!tab) {
		const fieldIds = Object.keys(Object.assign({}, ...Object.values(customType.json))) || "(none)";
		throw new CommandError(`Field "${id}" not found. Available: ${fieldIds}`);
	}
	resolveFieldTarget(tab, id);
	return [tab, () => updateCustomType(customType, apiConfig), "customType"];
}

export async function resolveModel(
	values: {
		"to-slice"?: string;
		"to-page-type"?: string;
		"to-custom-type"?: string;
		"from-slice"?: string;
		"from-page-type"?: string;
		"from-custom-type"?: string;
		variation?: string;
		tab?: string;
	},
	apiConfig: ApiConfig,
): Promise<Target> {
	const sliceName = values["to-slice"] ?? values["from-slice"];
	const pageTypeName = values["to-page-type"] ?? values["from-page-type"];
	const customTypeName = values["to-custom-type"] ?? values["from-custom-type"];

	const providedCount = [sliceName, pageTypeName, customTypeName].filter(Boolean).length;
	if (providedCount === 0) {
		throw new CommandError(
			"Specify a target with --to-slice, --to-page-type, or --to-custom-type.",
		);
	}
	if (providedCount > 1) {
		throw new CommandError(
			"Only one of --to-slice, --to-page-type, or --to-custom-type can be specified.",
		);
	}

	if (sliceName) {
		if ("tab" in values) {
			throw new CommandError("--tab is only valid for page types or custom types.");
		}

		const variation = values.variation ?? "default";
		const slices = await getSlices(apiConfig);
		const slice = slices.find((s) => s.name === sliceName);
		if (!slice) {
			throw new CommandError(`Slice not found: ${sliceName}`);
		}

		const newModel = structuredClone(slice);
		const newVariation = newModel.variations?.find((v) => v.id === variation);
		if (!newVariation) {
			const variationIds = slice.variations?.map((v) => v.id).join(", ") || "(none)";
			throw new CommandError(`Variation "${variation}" not found. Available: ${variationIds}`);
		}
		newVariation.primary ??= {};

		return [
			newVariation.primary,
			async () => {
				try {
					await updateSlice(newModel, apiConfig);
				} catch (error) {
					if (error instanceof UnknownRequestError) {
						const message = await error.text();
						throw new CommandError(`Failed to update slice: ${message}`);
					}
					throw error;
				}
			},
			"slice",
		];
	}

	// Page type or custom type
	const name = pageTypeName ?? customTypeName;
	const entityLabel = pageTypeName ? "Page type" : "Custom type";

	if ("variation" in values) {
		throw new CommandError("--variation is only valid for slices.");
	}

	const tab = values.tab ?? "Main";
	const customTypes = await getCustomTypes(apiConfig);
	const customType = customTypes.find((ct) => {
		if (ct.label !== name) return false;
		return pageTypeName ? ct.format === "page" : ct.format !== "page";
	});
	if (!customType) {
		throw new CommandError(`${entityLabel} not found: ${name}`);
	}

	const newModel = structuredClone(customType);
	const newTab = newModel.json[tab];
	if (!newTab) {
		const tabNames = Object.keys(customType.json).join(", ") || "(none)";
		throw new CommandError(`Tab "${tab}" not found. Available: ${tabNames}`);
	}

	return [
		newTab,
		async () => {
			try {
				await updateCustomType(newModel, apiConfig);
			} catch (error) {
				if (error instanceof UnknownRequestError) {
					const message = await error.text();
					throw new CommandError(`Failed to update ${entityLabel.toLowerCase()}: ${message}`);
				}
				throw error;
			}
		},
		"customType",
	];
}

export function resolveFieldTarget(
	fields: Fields,
	id: string,
): [targetFields: Fields, fieldId: string] {
	if (!id.includes(".")) {
		return [fields, id];
	}

	const segments = id.split(".");
	const fieldId = segments.pop();
	if (!fieldId) {
		throw new Error("This is a bug. We cannot continue.");
	}

	let currentFields = fields;
	for (const segment of segments) {
		const field = currentFields[segment];

		if (!field) {
			throw new CommandError(`Field "${segment}" does not exist.`);
		}

		if (field.type !== "Group") {
			throw new CommandError(`Field "${segment}" is not a group field.`);
		}

		field.config ??= {};
		field.config.fields ??= {};

		currentFields = field.config.fields;
	}

	return [currentFields, fieldId];
}
