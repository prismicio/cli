import type {
	CustomType,
	DynamicWidget,
	Link,
	SharedSlice,
} from "@prismicio/types-internal/lib/customtypes";

export function canonicalizeModel<T extends CustomType | SharedSlice>(model: T): T {
	const canonicalizedModel = sortKeys(model);
	if ("variations" in canonicalizedModel) {
		canonicalizedModel.variations = canonicalizedModel.variations.map((variation) =>
			sortKeys(variation),
		);
	}
	return canonicalizedModel;
}

function sortKeys<T extends Record<string, unknown>>(obj: T): T {
	return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) as T;
}

type Fields = Record<string, DynamicWidget>;

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

export function addField(container: Fields, fieldId: string, field: DynamicWidget): void {
	if (fieldId in container) throw new FieldExistsError(fieldId);
	container[fieldId] = field;
}

export function getField(container: Fields, fieldId: string): DynamicWidget {
	const field = container[fieldId];
	if (!field) throw new FieldNotFoundError(fieldId);
	return field;
}

export function reorderField(
	source: Fields,
	fieldId: string,
	target: Fields,
	anchorId: string,
	position: "before" | "after",
): void {
	const field = getField(source, fieldId);
	getField(target, anchorId);

	if (source !== target && fieldId in target) throw new FieldExistsError(fieldId);

	const entries = Object.entries(target).filter(([id]) => source !== target || id !== fieldId);

	delete source[fieldId];
	for (const id of Object.keys(target)) delete target[id];

	for (const [id, value] of entries) {
		if (position === "before" && id === anchorId) target[fieldId] = field;
		target[id] = value;
		if (position === "after" && id === anchorId) target[fieldId] = field;
	}
}

export function resolveContentRelationshipFieldSelection(
	paths: string[],
	targetTypeId: string,
	customTypes: CustomType[],
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

				const configuredTypes = (field as Link).config?.customtypes;
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
	customType: CustomType,
	tabName?: string,
): { fields: Fields; fieldId: string } {
	let tab;
	if (tabName) {
		tab = customType.json[tabName];
		if (!tab) throw new TabNotFoundError(tabName, customType.id);
	} else {
		const [root] = path.split(".");
		tab = Object.entries(customType.json).find(([name]) => root in customType.json[name])?.[1];
		if (!tab) throw new FieldNotFoundError(root);
	}
	return resolveNestedFieldContainer(path, tab);
}

export function resolveSliceFieldContainer(
	path: string,
	slice: SharedSlice,
	variationId: string,
): { fields: Fields; fieldId: string } {
	const variation = slice.variations.find((variation) => variation.id === variationId);
	if (!variation) throw new SliceVariationNotFoundError(variationId, slice.id);
	variation.primary ??= {};
	return resolveNestedFieldContainer(path, variation.primary);
}

function resolveNestedFieldContainer(
	path: string,
	fields: Fields,
): { fields: Fields; fieldId: string } {
	const [fieldId, ...remaining] = path.split(".");
	if (remaining.length === 0) return { fields, fieldId };
	const field = getField(fields, fieldId);
	switch (field.type) {
		case "Group": {
			field.config ??= {};
			field.config.fields ??= {};
			return resolveNestedFieldContainer(remaining.join("."), field.config.fields);
		}
		default:
			throw new UnsupportedNestedFieldError(fieldId);
	}
}

export class FieldExistsError extends Error {
	name = "FieldExistsError";
	id: string;

	constructor(id: string) {
		super(`Field "${id}" already exists.`);
		this.id = id;
	}
}

export class FieldNotFoundError extends Error {
	name = "FieldNotFoundError";
	id: string;

	constructor(id: string) {
		super(`Field "${id}" does not exist.`);
		this.id = id;
	}
}

export class UnsupportedNestedFieldError extends Error {
	name = "UnsupportedNestedFieldError";
	id: string;

	constructor(id: string) {
		super(`Field "${id}" does not support nested fields.`);
		this.id = id;
	}
}

export class FieldSelectionError extends Error {
	name = "FieldSelectionError";
}

export class TabNotFoundError extends Error {
	name = "TabNotFoundError";
	id: string;
	customTypeId: string;

	constructor(id: string, customTypeId: string) {
		super(`Tab "${id}" does not exist on type "${customTypeId}".`);
		this.id = id;
		this.customTypeId = customTypeId;
	}
}

export class SliceVariationNotFoundError extends Error {
	name = "SliceVariationNotFoundError";
	id: string;
	sliceId: string;

	constructor(id: string, sliceId: string) {
		super(`Variation "${id}" does not exist on slice "${sliceId}".`);
		this.id = id;
		this.sliceId = sliceId;
	}
}
