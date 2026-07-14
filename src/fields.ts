import type { DynamicWidget } from "@prismicio/types-internal/lib/customtypes";

import type { ContentRelationshipFieldSelection } from "./lib/prismic/models";

import { getAdapter } from "./adapters";
import { exactlyOneOption, type CommandConfig } from "./lib/command";
import {
	getField,
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

type ResolvedFieldTarget = {
	fields: Record<string, DynamicWidget>;
	fieldId: string;
	save: () => Promise<void>;
};

type ResolvedFieldContainer = Omit<ResolvedFieldTarget, "save">;

export async function getFieldReorderTargets(
	sourcePath: string,
	anchorPath: string,
	values: {
		"from-slice"?: string;
		"from-type"?: string;
		variation?: string;
	},
): Promise<{
	source: ResolvedFieldContainer;
	anchor: ResolvedFieldContainer;
	save: () => Promise<void>;
}> {
	const { variation = "default" } = values;
	const { key, value } = exactlyOneOption(values, ["from-slice", "from-type"]);
	const adapter = await getAdapter();

	if (key === "from-slice") {
		const { model } = await adapter.getSlice(value);
		return {
			source: resolveSliceFieldContainer(sourcePath, model, variation),
			anchor: resolveSliceFieldContainer(anchorPath, model, variation),
			save: async () => {
				await adapter.updateSlice(model);
				await adapter.generateTypes();
			},
		};
	} else {
		const { model } = await adapter.getCustomType(value);
		return {
			source: resolveCustomTypeFieldContainer(sourcePath, model),
			anchor: resolveCustomTypeFieldContainer(anchorPath, model),
			save: async () => {
				await adapter.updateCustomType(model);
				await adapter.generateTypes();
			},
		};
	}
}

export async function getNewFieldTarget(
	path: string,
	values: {
		"to-slice"?: string;
		"to-type"?: string;
		variation?: string;
		tab?: string;
	},
): Promise<ResolvedFieldTarget> {
	const { tab = "Main", variation = "default" } = values;
	const { key, value } = exactlyOneOption(values, ["to-slice", "to-type"]);
	return key === "to-slice"
		? getSliceFieldTarget(path, value, variation)
		: getCustomTypeFieldTarget(path, value, tab);
}

export async function getExistingField(
	path: string,
	values: {
		"from-slice"?: string;
		"from-type"?: string;
		variation?: string;
	},
): Promise<ResolvedFieldTarget & { field: DynamicWidget }> {
	const { variation = "default" } = values;
	const { key, value } = exactlyOneOption(values, ["from-slice", "from-type"]);
	const target =
		key === "from-slice"
			? await getSliceFieldTarget(path, value, variation)
			: await getCustomTypeFieldTarget(path, value);
	const field = getField(target.fields, target.fieldId);

	return { ...target, field };
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

async function getSliceFieldTarget(
	path: string,
	sliceId: string,
	variationId: string,
): Promise<ResolvedFieldTarget> {
	const adapter = await getAdapter();
	const { model } = await adapter.getSlice(sliceId);
	const fieldContainer = resolveSliceFieldContainer(path, model, variationId);

	return {
		...fieldContainer,
		save: async () => {
			await adapter.updateSlice(model);
			await adapter.generateTypes();
		},
	};
}

async function getCustomTypeFieldTarget(
	path: string,
	customTypeId: string,
	tabName?: string,
): Promise<ResolvedFieldTarget> {
	const adapter = await getAdapter();
	const { model } = await adapter.getCustomType(customTypeId);
	const fieldContainer = resolveCustomTypeFieldContainer(path, model, tabName);

	return {
		...fieldContainer,
		save: async () => {
			await adapter.updateCustomType(model);
			await adapter.generateTypes();
		},
	};
}
