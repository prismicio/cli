import type {
	DynamicCustomTypeModel,
	DynamicSlicesModel,
	DynamicWidgetModel,
	LinkModel,
	SharedSliceModel,
} from "@prismicio/types-internal";

import { type ArrayDiff, diffArrays } from "../diff";
import { type CustomTypesConfig, getCustomTypes, getSlices } from "./clients/custom-types";

type Fields = Record<string, DynamicWidgetModel>;

export type Models = { customTypes: DynamicCustomTypeModel[]; slices: SharedSliceModel[] };
export type ModelsDiff = {
	customTypes: ArrayDiff<DynamicCustomTypeModel>;
	slices: ArrayDiff<SharedSliceModel>;
};

export type ContentRelationshipFieldSelection =
	| string
	| {
			id: string;
			fields: ContentRelationshipFieldSelection[];
	  }
	| {
			id: string;
			customtypes: { id: string; fields: ContentRelationshipFieldSelection[] }[];
	  };

const UNFETCHABLE_FIELD_TYPES = ["Slices", "UID", "Choice"];

export function resolveContentRelationshipFieldSelection(
	paths: string[],
	targetTypeId: string,
	customTypes: DynamicCustomTypeModel[],
): ContentRelationshipFieldSelection[] {
	const customTypesById = new Map(customTypes.map((customType) => [customType.id, customType]));
	const targetType = customTypesById.get(targetTypeId);
	if (!targetType) throw new FieldSelectionError(`Custom type "${targetTypeId}" does not exist.`);

	const resolve = (
		paths: string[],
		fields: Fields,
		customTypeId: string,
		canCrossRelationship: boolean,
	): ContentRelationshipFieldSelection[] => {
		const groupedPaths = new Map<string, string[]>();
		for (const path of paths) {
			const [id, ...remaining] = path.split(".");
			const grouped = groupedPaths.get(id) ?? [];
			grouped.push(remaining.join("."));
			groupedPaths.set(id, grouped);
		}

		return Array.from(groupedPaths, ([id, remainingPaths]) => {
			const field = fields[id];
			if (!field) {
				throw new FieldSelectionError(`Field "${id}" does not exist on type "${customTypeId}".`);
			}

			const nestedPaths = remainingPaths.filter(Boolean);
			if (nestedPaths.length === 0) {
				if (UNFETCHABLE_FIELD_TYPES.includes(field.type) || id === "uid") {
					throw new FieldSelectionError(
						`Field "${id}" cannot be fetched from a content relationship.`,
					);
				}
				if (field.type === "Group") {
					throw new FieldSelectionError(`Field "${id}" is a group. Select specific subfields.`);
				}
				return id;
			}

			if (nestedPaths.length !== remainingPaths.length) {
				throw new FieldSelectionError(
					`Field "${id}" cannot be selected both directly and through its subfields.`,
				);
			}

			if (field.type === "Group") {
				return {
					id,
					fields: resolve(
						nestedPaths,
						field.config?.fields ?? {},
						customTypeId,
						canCrossRelationship,
					),
				};
			}

			if (field.type === "Link" && field.config?.select === "document") {
				if (!canCrossRelationship) {
					throw new FieldSelectionError("Content relationships cannot be nested more than once.");
				}

				const configuredTypes = (field as LinkModel).config?.customtypes;
				if (!configuredTypes || configuredTypes.length !== 1) {
					throw new FieldSelectionError(
						`Field "${id}" must target exactly one custom type to select its fields.`,
					);
				}

				const nestedTypeId =
					typeof configuredTypes[0] === "string" ? configuredTypes[0] : configuredTypes[0].id;
				const nestedType = customTypesById.get(nestedTypeId);
				if (!nestedType) {
					throw new FieldSelectionError(`Custom type "${nestedTypeId}" does not exist.`);
				}

				const nestedFields: Fields = Object.assign({}, ...Object.values(nestedType.json));
				return {
					id,
					customtypes: [
						{
							id: nestedTypeId,
							fields: resolve(nestedPaths, nestedFields, nestedTypeId, false),
						},
					],
				};
			}

			throw new FieldSelectionError(`Field "${id}" is not a group or content relationship field.`);
		});
	};

	const fields: Fields = Object.assign({}, ...Object.values(targetType.json));
	return resolve(paths, fields, targetType.id, true);
}

export function resolveCustomTypeFieldContainer(
	path: string,
	customType: DynamicCustomTypeModel,
	tabName?: string,
): { fields: Fields; fieldId: string } {
	if (tabName) {
		const tab = customType.json[tabName];
		if (!tab) throw new TabNotFoundError(tabName, customType.id);
		return resolveNestedFieldContainer(path, tab);
	}
	const [root] = path.split(".");
	const tab = Object.values(customType.json).find((fields) => root in fields);
	if (!tab) throw new FieldNotFoundError(root);
	return resolveNestedFieldContainer(path, tab);
}

export function resolveSliceFieldContainer(
	path: string,
	slice: SharedSliceModel,
	variationId: string,
): { fields: Fields; fieldId: string } {
	const variation = slice.variations.find((variation) => variation.id === variationId);
	if (!variation) throw new SliceVariationNotFoundError(variationId, slice.id);
	variation.primary ??= {};
	return resolveNestedFieldContainer(path, variation.primary);
}

export async function getRemoteModels(config: CustomTypesConfig): Promise<Models> {
	const [customTypes, slices] = await Promise.all([getCustomTypes(config), getSlices(config)]);
	return { customTypes, slices };
}

export function diffModels(
	source: Models,
	target: Models,
	options: { treatNonCanonicalAsChanged?: boolean } = {},
): ModelsDiff {
	const { treatNonCanonicalAsChanged = false } = options;
	return {
		customTypes: diffArrays(source.customTypes, target.customTypes, {
			getKey: (model) => model.id,
			equals: (a, b) =>
				JSON.stringify(canonicalizeCustomType(a)) ===
				JSON.stringify(treatNonCanonicalAsChanged ? b : canonicalizeCustomType(b)),
		}),
		slices: diffArrays(source.slices, target.slices, {
			getKey: (model) => model.id,
			equals: (a, b) =>
				JSON.stringify(canonicalizeSlice(a)) ===
				JSON.stringify(treatNonCanonicalAsChanged ? b : canonicalizeSlice(b)),
		}),
	};
}

export function canonicalizeCustomType(model: DynamicCustomTypeModel): DynamicCustomTypeModel {
	return {
		...sortKeys(model),
		json: Object.fromEntries(
			Object.entries(model.json).map(([tab, fields]) => [tab, canonicalizeFields(fields)]),
		),
	};
}

export function canonicalizeSlice(model: SharedSliceModel): SharedSliceModel {
	return {
		...sortKeys(model),
		variations: model.variations.map((variation) => {
			const sorted = sortKeys(variation);
			if (variation.primary) sorted.primary = canonicalizeFields(variation.primary);
			if (variation.items) sorted.items = canonicalizeFields(variation.items);
			return sorted;
		}),
	};
}

function canonicalizeFields<F extends DynamicWidgetModel>(
	fields: Record<string, F>,
): Record<string, F> {
	return Object.fromEntries(
		Object.entries(fields).map(([id, field]) => {
			const sorted = sortKeys(field);
			if (
				field.type === "Group" &&
				field.config?.fields &&
				sorted.type === "Group" &&
				sorted.config?.fields
			) {
				sorted.config.fields = canonicalizeFields(field.config.fields);
			}
			if (
				field.type === "Slices" &&
				field.config?.choices &&
				sorted.type === "Slices" &&
				sorted.config?.choices
			) {
				sorted.config.choices = canonicalizeChoices(field.config.choices);
			}
			return [id, sorted];
		}),
	);
}

type Choices = NonNullable<NonNullable<DynamicSlicesModel["config"]>["choices"]>;

// Entry order of a slice zone's choices is its slice order, and legacy slices
// hold field maps of their own.
function canonicalizeChoices(choices: Choices): Choices {
	return Object.fromEntries(
		Object.entries(choices).map(([id, choice]) => {
			const sorted = sortKeys(choice);
			if (choice.type === "Slice" && sorted.type === "Slice") {
				if (choice["non-repeat"]) sorted["non-repeat"] = canonicalizeFields(choice["non-repeat"]);
				if (choice.repeat) sorted.repeat = canonicalizeFields(choice.repeat);
			}
			return [id, sorted];
		}),
	);
}

function sortKeys<T>(object: T): T {
	if (Array.isArray(object)) return object.map(sortKeys) as T;
	if (object === null || typeof object !== "object") return object;
	return Object.fromEntries(
		Object.entries(object)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, value]) => [key, sortKeys(value)]),
	) as T;
}

function resolveNestedFieldContainer(
	path: string,
	fields: Fields,
): { fields: Fields; fieldId: string } {
	const [fieldId, ...remaining] = path.split(".");
	if (remaining.length === 0) return { fields, fieldId };
	const field = fields[fieldId];
	if (!field) throw new FieldNotFoundError(fieldId);
	if (field.type !== "Group") throw new UnsupportedNestedFieldError(fieldId);
	field.config ??= {};
	field.config.fields ??= {};
	return resolveNestedFieldContainer(remaining.join("."), field.config.fields);
}

export class FieldExistsError extends Error {
	name = "FieldExistsError";

	constructor(id: string) {
		super(`Field "${id}" already exists.`);
	}
}

export class FieldNotFoundError extends Error {
	name = "FieldNotFoundError";

	constructor(id: string) {
		super(`Field "${id}" does not exist.`);
	}
}

export class UnsupportedNestedFieldError extends Error {
	name = "UnsupportedNestedFieldError";

	constructor(id: string) {
		super(`Field "${id}" does not support nested fields.`);
	}
}

export class FieldSelectionError extends Error {
	name = "FieldSelectionError";
}

export class TabNotFoundError extends Error {
	name = "TabNotFoundError";

	constructor(id: string, customTypeId: string) {
		super(`Tab "${id}" does not exist on type "${customTypeId}".`);
	}
}

export class SliceVariationNotFoundError extends Error {
	name = "SliceVariationNotFoundError";

	constructor(id: string, sliceId: string) {
		super(`Variation "${id}" does not exist on slice "${sliceId}".`);
	}
}
