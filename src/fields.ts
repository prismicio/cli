import type { DynamicWidget } from "@prismicio/types-internal/lib/customtypes";

import type { ContentRelationshipFieldSelection } from "./lib/prismic/models";

import { getAdapter } from "./adapters";
import { exactlyOneOption, type CommandConfig } from "./lib/command";
import {
	FieldExistsError,
	FieldNotFoundError,
	resolveCustomTypeFieldContainer,
	resolveContentRelationshipFieldSelection,
	resolveSliceFieldContainer,
} from "./lib/prismic/models";

export const TARGET_OPTIONS = {
	"to-slice": {
		type: "string",
		description: "ID of the target slice",
	},
	"to-type": {
		type: "string",
		description: "ID of the target content type",
	},
	variation: {
		type: "string",
		description: 'Slice variation ID (default: "default")',
		dependsOn: "to-slice",
	},
	tab: {
		type: "string",
		description: 'Content type tab name (default: "Main")',
		dependsOn: "to-type",
	},
} satisfies CommandConfig["options"];

export const SOURCE_OPTIONS = {
	"from-slice": {
		type: "string",
		description: "ID of the source slice",
	},
	"from-type": {
		type: "string",
		description: "ID of the source content type",
	},
	variation: {
		type: "string",
		description: 'Slice variation ID (default: "default")',
		dependsOn: "from-slice",
	},
} satisfies CommandConfig["options"];

type SourceValues = { "from-slice"?: string; "from-type"?: string; variation?: string };
type FieldContainer = { fields: Record<string, DynamicWidget>; fieldId: string };
type FieldTarget = FieldContainer & { save: () => Promise<void> };

async function loadModel(
	isSlice: boolean,
	id: string,
	options: { variation?: string; tab?: string },
): Promise<{ resolve: (path: string) => FieldContainer; save: () => Promise<void> }> {
	const adapter = await getAdapter();
	if (isSlice) {
		const { model } = await adapter.getSlice(id);
		return {
			resolve: (path) => resolveSliceFieldContainer(path, model, options.variation ?? "default"),
			save: async () => {
				await adapter.updateSlice(model);
				await adapter.generateTypes();
			},
		};
	}
	const { model } = await adapter.getCustomType(id);
	return {
		resolve: (path) => resolveCustomTypeFieldContainer(path, model, options.tab),
		save: async () => {
			await adapter.updateCustomType(model);
			await adapter.generateTypes();
		},
	};
}

export async function getFieldReorderTargets(
	sourcePath: string,
	anchorPath: string,
	values: SourceValues,
): Promise<{ source: FieldContainer; anchor: FieldContainer; save: () => Promise<void> }> {
	const { key, value } = exactlyOneOption(values, ["from-slice", "from-type"]);
	const { resolve, save } = await loadModel(key === "from-slice", value, values);
	const source = resolve(sourcePath);
	const anchor = resolve(anchorPath);
	if (!(source.fieldId in source.fields)) throw new FieldNotFoundError(sourcePath);
	if (!(anchor.fieldId in anchor.fields)) throw new FieldNotFoundError(anchorPath);
	return { source, anchor, save };
}

export async function getNewFieldTarget(
	path: string,
	values: { "to-slice"?: string; "to-type"?: string; variation?: string; tab?: string },
): Promise<FieldTarget> {
	const { variation, tab = "Main" } = values;
	const { key, value } = exactlyOneOption(values, ["to-slice", "to-type"]);
	const { resolve, save } = await loadModel(key === "to-slice", value, { variation, tab });
	const target = { ...resolve(path), save };
	if (target.fieldId in target.fields) throw new FieldExistsError(path);
	return target;
}

export async function getExistingField(
	path: string,
	values: SourceValues,
): Promise<FieldTarget & { field: DynamicWidget }> {
	const { key, value } = exactlyOneOption(values, ["from-slice", "from-type"]);
	const { resolve, save } = await loadModel(key === "from-slice", value, values);
	const target = resolve(path);
	const field = target.fields[target.fieldId];
	if (!field) throw new FieldNotFoundError(path);
	return { ...target, save, field };
}

export async function getContentRelationshipFieldSelection(
	paths: string[],
	targetTypeId: string,
): Promise<ContentRelationshipFieldSelection[]> {
	const adapter = await getAdapter();
	const customTypes = await adapter.getCustomTypes();
	return resolveContentRelationshipFieldSelection(
		paths,
		targetTypeId,
		customTypes.map(({ model }) => model),
	);
}
