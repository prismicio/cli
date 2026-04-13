import type { CustomType, DynamicWidget, Link } from "@prismicio/types-internal/lib/customtypes";

import type { CommandConfig } from "./lib/command";

import { getAdapter } from "./adapters";
import { getCustomType, getSlices, updateCustomType, updateSlice } from "./clients/custom-types";
import { CommandError } from "./lib/command";
import { NotFoundRequestError, UnknownRequestError } from "./lib/request";

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

	let customType;
	try {
		customType = await getCustomType(fromType!, apiConfig);
	} catch (error) {
		if (error instanceof NotFoundRequestError) throw new CommandError(`Type not found: ${fromType}`);
		throw error;
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
	let customType;
	try {
		customType = await getCustomType(typeId!, apiConfig);
	} catch (error) {
		if (error instanceof NotFoundRequestError) throw new CommandError(`Type not found: ${typeId}`);
		throw error;
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

const EXCLUDED_FIELD_TYPES = ["Slices", "UID", "Choice"];

function flattenTypeFields(type: CustomType): Record<string, Field> {
	const fields: Record<string, Field> = {};
	for (const tab of Object.values(type.json)) {
		Object.assign(fields, tab);
	}
	return fields;
}

function validateLeafField(id: string, fields: Record<string, Field>, typeId: string): void {
	if (!(id in fields)) {
		throw new CommandError(`Field "${id}" not found on type "${typeId}".`);
	}
	if (EXCLUDED_FIELD_TYPES.includes(fields[id].type) || id === "uid") {
		throw new CommandError(`Field "${id}" cannot be fetched from a content relationship.`);
	}
	if (fields[id].type === "Group") {
		throw new CommandError(`Field "${id}" is a group. Select specific sub-fields with --field ${id}.<sub-field>.`);
	}
}

function isContentRelationship(field: Field): field is Link {
	return field.type === "Link" && field.config?.select === "document";
}

function getCRTargetTypeId(field: Link, fieldId: string): string {
	const cts = field.config?.customtypes;
	if (!cts || cts.length !== 1) {
		throw new CommandError(
			`Field "${fieldId}" must be restricted to a single custom type to select fields from it.`,
		);
	}
	return typeof cts[0] === "string" ? cts[0] : cts[0].id;
}

function groupByFirstSegment(paths: string[]): { leaves: string[]; nested: Map<string, string[]> } {
	const leaves: string[] = [];
	const nested = new Map<string, string[]>();
	for (const path of paths) {
		const dot = path.indexOf(".");
		if (dot === -1) {
			leaves.push(path);
		} else {
			const first = path.slice(0, dot);
			const rest = path.slice(dot + 1);
			if (!nested.has(first)) nested.set(first, []);
			nested.get(first)!.push(rest);
		}
	}
	return { leaves, nested };
}

// Level 2: fields on a CR's target type. Only leaves and groups (with leaf-only sub-fields).
function resolveLevel2Fields(
	paths: string[],
	targetType: CustomType,
): (string | { id: string; fields: string[] })[] {
	const fields = flattenTypeFields(targetType);
	const { leaves, nested } = groupByFirstSegment(paths);

	for (const id of leaves) {
		validateLeafField(id, fields, targetType.id);
	}

	const result: (string | { id: string; fields: string[] })[] = [...leaves];

	for (const [groupId, subPaths] of nested) {
		if (!(groupId in fields)) {
			throw new CommandError(`Field "${groupId}" not found on type "${targetType.id}".`);
		}
		if (fields[groupId].type !== "Group") {
			throw new CommandError(`Field "${groupId}" is not a group field.`);
		}
		const groupFields = fields[groupId].config?.fields ?? {};
		for (const subId of subPaths) {
			if (subId.includes(".")) {
				throw new CommandError(`Cannot nest deeper than --field group.cr.group.leaf.`);
			}
			if (!(subId in groupFields)) {
				throw new CommandError(`Field "${subId}" not found in group "${groupId}".`);
			}
		}
		result.push({ id: groupId, fields: subPaths });
	}

	return result;
}

// Level 1: fields on the --custom-type target. Leaves, groups, and CR fields (which cross into level 2).
export async function resolveFieldSelection(
	fieldSelection: string[],
	targetType: CustomType,
	apiConfig: ApiConfig,
): Promise<
	(
		| string
		| { id: string; fields: (string | { id: string; customtypes: { id: string; fields: (string | { id: string; fields: string[] })[] }[] })[] }
		| { id: string; customtypes: { id: string; fields: (string | { id: string; fields: string[] })[] }[] }
	)[]
> {
	const fields = flattenTypeFields(targetType);
	const { leaves, nested } = groupByFirstSegment(fieldSelection);

	for (const id of leaves) {
		validateLeafField(id, fields, targetType.id);
	}

	const result: Awaited<ReturnType<typeof resolveFieldSelection>> = [...leaves];

	for (const [id, subPaths] of nested) {
		if (!(id in fields)) {
			throw new CommandError(`Field "${id}" not found on type "${targetType.id}".`);
		}
		const field = fields[id];

		if (field.type === "Group") {
			const groupFields = field.config?.fields ?? {};
			const { leaves: groupLeaves, nested: groupNested } = groupByFirstSegment(subPaths);

			for (const subId of groupLeaves) {
				validateLeafField(subId, groupFields, targetType.id);
			}

			const groupResult: (string | { id: string; customtypes: { id: string; fields: (string | { id: string; fields: string[] })[] }[] })[] = [
				...groupLeaves,
			];

			for (const [crId, crSubPaths] of groupNested) {
				if (!(crId in groupFields)) {
					throw new CommandError(`Field "${crId}" not found in group "${id}".`);
				}
				const crField = groupFields[crId];
				if (!isContentRelationship(crField)) {
					throw new CommandError(`Field "${crId}" in group "${id}" is not a content relationship.`);
				}
				const ctId = getCRTargetTypeId(crField, crId);
				const nestedType = await getCustomType(ctId, apiConfig);
				const nestedFields = resolveLevel2Fields(crSubPaths, nestedType);
				groupResult.push({ id: crId, customtypes: [{ id: ctId, fields: nestedFields }] });
			}

			result.push({ id, fields: groupResult });
		} else if (isContentRelationship(field)) {
			const ctId = getCRTargetTypeId(field, id);
			const nestedType = await getCustomType(ctId, apiConfig);
			const nestedFields = resolveLevel2Fields(subPaths, nestedType);
			result.push({ id, customtypes: [{ id: ctId, fields: nestedFields }] });
		} else {
			throw new CommandError(
				`Field "${id}" is not a group or content relationship field.`,
			);
		}
	}

	return result;
}
