import type { DynamicWidget } from "@prismicio/types-internal/lib/customtypes";

import type { CommandConfig } from "./lib/command";

import { getAdapter } from "./adapters";
import { getCustomTypes, getSlices, updateCustomType, updateSlice } from "./clients/custom-types";
import { CommandError } from "./lib/command";
import { UnknownRequestError } from "./lib/request";

type Field = DynamicWidget;
type Fields = Record<string, Field>;
type ModelKind = "slice" | "customType";
type ApiConfig = { repo: string; token: string | undefined; host: string };
type Target = [fields: Fields, save: () => Promise<void>, modelKind: ModelKind];

export const TARGET_OPTIONS = {
	"to-slice": { type: "string", description: "ID of the target slice" },
	"to-type": { type: "string", description: "ID of the target content type" },
	variation: { type: "string", description: 'Slice variation ID (default: "default")' },
	tab: { type: "string", description: 'Content type tab name (default: "Main")' },
	repo: { type: "string", short: "r", description: "Repository domain" },
} satisfies CommandConfig["options"];

export const SOURCE_OPTIONS = {
	"from-slice": { type: "string", description: "ID of the source slice" },
	"from-type": { type: "string", description: "ID of the source content type" },
	variation: TARGET_OPTIONS.variation,
	tab: TARGET_OPTIONS.tab,
	repo: TARGET_OPTIONS.repo,
} satisfies CommandConfig["options"];

export async function resolveFieldContainer(
	id: string,
	values: {
		"from-slice"?: string;
		"from-type"?: string;
		variation?: string;
	},
	apiConfig: ApiConfig,
): Promise<Target> {
	const adapter = await getAdapter();
	const {
		"from-slice": fromSlice,
		"from-type": fromType,
		variation: variationId = "default",
	} = values;

	const providedCount = [fromSlice, fromType].filter(Boolean).length;
	if (providedCount === 0) {
		throw new CommandError("Specify a target with --from-slice or --from-type.");
	}
	if (providedCount > 1) {
		throw new CommandError("Only one of --from-slice or --from-type can be specified.");
	}

	if (fromSlice) {
		const slices = await getSlices(apiConfig);
		const slice = slices.find((s) => s.id === fromSlice);
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
		return [
			variation.primary,
			async () => {
				await updateSlice(slice, apiConfig);
				try {
					await adapter.updateSlice(slice);
				} catch {
					await adapter.createSlice(slice);
				}
				await adapter.generateTypes();
			},
			"slice",
		];
	}

	const customTypes = await getCustomTypes(apiConfig);
	const customType = customTypes.find((ct) => ct.id === fromType);
	if (!customType) {
		throw new CommandError(`Type not found: ${fromType}`);
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
	return [
		tab,
		async () => {
			await updateCustomType(customType, apiConfig);
			try {
				await adapter.updateCustomType(customType);
			} catch {
				await adapter.createCustomType(customType);
			}
			await adapter.generateTypes();
		},
		"customType",
	];
}

export async function resolveModel(
	values: {
		"to-slice"?: string;
		"to-type"?: string;
		"from-slice"?: string;
		"from-type"?: string;
		variation?: string;
		tab?: string;
	},
	apiConfig: ApiConfig,
): Promise<Target> {
	const adapter = await getAdapter();
	const sliceId = values["to-slice"] ?? values["from-slice"];
	const typeId = values["to-type"] ?? values["from-type"];

	const providedCount = [sliceId, typeId].filter(Boolean).length;
	if (providedCount === 0) {
		throw new CommandError("Specify a target with --to-slice or --to-type.");
	}
	if (providedCount > 1) {
		throw new CommandError("Only one of --to-slice or --to-type can be specified.");
	}

	if (sliceId) {
		if ("tab" in values) {
			throw new CommandError("--tab is only valid for content types.");
		}

		const variation = values.variation ?? "default";
		const slices = await getSlices(apiConfig);
		const slice = slices.find((s) => s.id === sliceId);
		if (!slice) {
			throw new CommandError(`Slice not found: ${sliceId}`);
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
				try {
					await adapter.updateSlice(newModel);
				} catch {
					await adapter.createSlice(newModel);
				}
				await adapter.generateTypes();
			},
			"slice",
		];
	}

	if ("variation" in values) {
		throw new CommandError("--variation is only valid for slices.");
	}

	const tab = values.tab ?? "Main";
	const customTypes = await getCustomTypes(apiConfig);
	const customType = customTypes.find((ct) => ct.id === typeId);
	if (!customType) {
		throw new CommandError(`Type not found: ${typeId}`);
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
					throw new CommandError(`Failed to update type: ${message}`);
				}
				throw error;
			}
			try {
				await adapter.updateCustomType(newModel);
			} catch {
				await adapter.createCustomType(newModel);
			}
			await adapter.generateTypes();
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
