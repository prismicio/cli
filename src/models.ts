import type {
	CustomType,
	DynamicWidget,
	Link,
	SharedSlice,
} from "@prismicio/types-internal/lib/customtypes";

import type { Adapter } from "./adapters";
import type { CommandConfig } from "./lib/command";

import { getAdapter } from "./adapters";
import { CommandError } from "./lib/command";

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

type Field = DynamicWidget;
type Fields = Record<string, Field>;
type ModelKind = "slice" | "customType";
type Target = [fields: Fields, save: () => Promise<void>, modelKind: ModelKind];

export const TARGET_OPTIONS = {
	"to-slice": { type: "string", description: "ID of the target slice" },
	"to-type": { type: "string", description: "ID of the target content type" },
	variation: { type: "string", description: 'Slice variation ID (default: "default")' },
	tab: { type: "string", description: 'Content type tab name (default: "Main")' },
} satisfies CommandConfig["options"];

export const SOURCE_OPTIONS = {
	"from-slice": { type: "string", description: "ID of the source slice" },
	"from-type": { type: "string", description: "ID of the source content type" },
	variation: TARGET_OPTIONS.variation,
} satisfies CommandConfig["options"];

export async function resolveFieldContainer(
	id: string,
	values: {
		"from-slice"?: string;
		"from-type"?: string;
		variation?: string;
	},
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
		const slice = await adapter.getSlice(fromSlice);
		const variation = slice.model.variations.find((v) => v.id === variationId);
		if (!variation) {
			const variationIds = slice.model.variations?.map((v) => v.id).join(", ") || "(none)";
			throw new CommandError(`Variation "${variationId}" not found. Available: ${variationIds}`);
		}
		variation.primary ??= {};
		resolveFieldTarget(variation.primary, id);
		return [
			variation.primary,
			async () => {
				await adapter.updateSlice(slice.model);
				await adapter.generateTypes();
			},
			"slice",
		];
	}

	const customType = await adapter.getCustomType(fromType!);
	const root = id.includes(".") ? id.split(".")[0] : id;
	let tab: Record<string, DynamicWidget> | undefined;
	for (const tabName in customType.model.json) {
		if (root in customType.model.json[tabName]) tab = customType.model.json[tabName];
	}
	if (!tab) {
		const fieldIds =
			Object.keys(Object.assign({}, ...Object.values(customType.model.json))).join(", ") ||
			"(none)";
		throw new CommandError(`Field "${id}" not found. Available: ${fieldIds}`);
	}
	resolveFieldTarget(tab, id);
	return [
		tab,
		async () => {
			await adapter.updateCustomType(customType.model);
			await adapter.generateTypes();
		},
		"customType",
	];
}

export async function resolveFieldPair(
	sourceId: string,
	anchorId: string,
	values: {
		"from-slice"?: string;
		"from-type"?: string;
		variation?: string;
	},
): Promise<
	[sourceFields: Fields, anchorFields: Fields, save: () => Promise<void>, modelKind: ModelKind]
> {
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
		const slice = await adapter.getSlice(fromSlice);
		const variation = slice.model.variations.find((v) => v.id === variationId);
		if (!variation) {
			const variationIds = slice.model.variations?.map((v) => v.id).join(", ") || "(none)";
			throw new CommandError(`Variation "${variationId}" not found. Available: ${variationIds}`);
		}
		variation.primary ??= {};
		return [
			variation.primary,
			variation.primary,
			async () => {
				await adapter.updateSlice(slice.model);
				await adapter.generateTypes();
			},
			"slice",
		];
	}

	const customType = await adapter.getCustomType(fromType!);

	const sourceRoot = sourceId.includes(".") ? sourceId.split(".")[0] : sourceId;
	const anchorRoot = anchorId.includes(".") ? anchorId.split(".")[0] : anchorId;

	let sourceTab: Record<string, DynamicWidget> | undefined;
	let anchorTab: Record<string, DynamicWidget> | undefined;
	for (const tabName in customType.model.json) {
		const tab = customType.model.json[tabName];
		if (sourceRoot in tab) sourceTab = tab;
		if (anchorRoot in tab) anchorTab = tab;
	}

	const allFieldIds = Object.keys(Object.assign({}, ...Object.values(customType.model.json)));
	const available = allFieldIds.join(", ") || "(none)";
	if (!sourceTab) {
		throw new CommandError(`Field "${sourceId}" not found. Available: ${available}`);
	}
	if (!anchorTab) {
		throw new CommandError(`Field "${anchorId}" not found. Available: ${available}`);
	}

	return [
		sourceTab,
		anchorTab,
		async () => {
			await adapter.updateCustomType(customType.model);
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

		const variationId = values.variation ?? "default";
		const slice = await adapter.getSlice(sliceId);

		const variation = slice.model.variations?.find((v) => v.id === variationId);
		if (!variation) {
			const variationIds = slice.model.variations?.map((v) => v.id).join(", ") || "(none)";
			throw new CommandError(`Variation "${variationId}" not found. Available: ${variationIds}`);
		}
		variation.primary ??= {};

		return [
			variation.primary,
			async () => {
				await adapter.updateSlice(slice.model);
				await adapter.generateTypes();
			},
			"slice",
		];
	}

	if ("variation" in values) {
		throw new CommandError("--variation is only valid for slices.");
	}

	const tabName = values.tab ?? "Main";
	const customType = await adapter.getCustomType(typeId!);

	const tab = customType.model.json[tabName];
	if (!tab) {
		const tabNames = Object.keys(customType.model.json).join(", ") || "(none)";
		throw new CommandError(`Tab "${tabName}" not found. Available: ${tabNames}`);
	}

	return [
		tab,
		async () => {
			await adapter.updateCustomType(customType.model);
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

// Mirrors the Prismic API's nested field selection format for content relationships.
// A field is either a leaf (string), a group (with sub-fields), or a CR (with a target type).
type ResolvedField =
	| string
	| { id: string; fields: ResolvedField[] }
	| { id: string; customtypes: { id: string; fields: ResolvedField[] }[] };

const UNFETCHABLE_FIELD_TYPES = ["Slices", "UID", "Choice"];

/**
 * Resolves user-provided dot-separated field paths (e.g. ["title", "group.cr.name"])
 * against a custom type, producing the nested structure the Prismic API expects.
 */
export async function resolveFieldSelection(
	fieldSelection: string[],
	targetTypeId: string,
): Promise<ResolvedField[]> {
	const adapter = await getAdapter();
	const targetType = await adapter.getCustomType(targetTypeId);

	// Merge all tabs into one flat field map.
	const fields: Record<string, Field> = Object.assign({}, ...Object.values(targetType.model.json));

	return resolveFields(fieldSelection, fields, targetType.model.id, adapter, 1);
}

/**
 * Splits paths by their first segment, validates leaves, and recurses into
 * groups and content relationships.
 *
 * @param crDepth - How many more CR boundaries we can cross. The API supports
 *   at most: type → CR → group → leaf, so the entry point passes 1.
 */
async function resolveFields(
	paths: string[],
	fields: Record<string, Field>,
	context: string,
	adapter: Adapter,
	crDepth: number,
): Promise<ResolvedField[]> {
	const result: ResolvedField[] = [];
	const grouped = new Map<string, string[]>();

	// Split each path into leaves (no dot) vs. prefixed groups (has dot).
	for (const path of paths) {
		const dot = path.indexOf(".");
		if (dot === -1) {
			validateLeafField(path, fields, context);
			result.push(path);
		} else {
			const key = path.slice(0, dot);
			const rest = path.slice(dot + 1);
			if (!grouped.has(key)) grouped.set(key, []);
			grouped.get(key)!.push(rest);
		}
	}

	// Recurse into each prefixed group.
	for (const [id, subPaths] of grouped) {
		const field = fields[id];
		if (!field) {
			throw new CommandError(`Field "${id}" not found on type "${context}".`);
		}

		if (field.type === "Group") {
			const groupFields = field.config?.fields ?? {};
			const resolved = await resolveFields(subPaths, groupFields, context, adapter, crDepth);
			result.push({ id, fields: resolved });
		} else if (field.type === "Link" && field.config?.select === "document") {
			if (crDepth <= 0) {
				throw new CommandError("Cannot nest deeper than --field group.cr.group.leaf.");
			}

			// CR must target exactly one custom type so we know which schema to resolve against.
			const cts = (field as Link).config?.customtypes;
			if (!cts || cts.length !== 1) {
				throw new CommandError(
					`Field "${id}" must be restricted to a single custom type to select fields from it.`,
				);
			}
			const ctId = typeof cts[0] === "string" ? cts[0] : cts[0].id;

			// Cross the CR boundary: read the target type and resolve sub-paths against it.
			const nestedType = await adapter.getCustomType(ctId);
			const nestedFields: Record<string, Field> = Object.assign(
				{},
				...Object.values(nestedType.model.json),
			);
			const resolved = await resolveFields(subPaths, nestedFields, ctId, adapter, crDepth - 1);
			result.push({ id, customtypes: [{ id: ctId, fields: resolved }] });
		} else {
			throw new CommandError(`Field "${id}" is not a group or content relationship field.`);
		}
	}

	return result;
}

function validateLeafField(id: string, fields: Record<string, Field>, context: string): void {
	if (!(id in fields)) {
		throw new CommandError(`Field "${id}" not found on type "${context}".`);
	}
	if (UNFETCHABLE_FIELD_TYPES.includes(fields[id].type) || id === "uid") {
		throw new CommandError(`Field "${id}" cannot be fetched from a content relationship.`);
	}
	if (fields[id].type === "Group") {
		throw new CommandError(
			`Field "${id}" is a group. Select specific sub-fields with --field ${id}.<sub-field>.`,
		);
	}
}

export function getPostFieldAddMessage(args: {
	targetId: string;
	modelKind: "slice" | "customType";
}): string {
	const { modelKind, targetId } = args;

	if (modelKind === "slice") {
		return `Run \`prismic slice view ${targetId}\` to view the updated slice.`;
	} else {
		return `Run \`prismic type view ${targetId}\` to view the updated type.`;
	}
}
