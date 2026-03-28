import type { DynamicWidget } from "@prismicio/types-internal/lib/customtypes";

import { pathToFileURL } from "node:url";

import type { Adapter } from "./adapters";
import type { CommandConfig } from "./lib/command";

import { CommandError } from "./lib/command";
import { appendTrailingSlash, relativePathname } from "./lib/url";
import { findProjectRoot } from "./project";

type Field = DynamicWidget;
type Fields = Record<string, Field>;
type Target = [fields: Fields, save: () => Promise<void>];

export const TARGET_OPTIONS = {
	to: {
		type: "string",
		description: "Relative path to the slice, page type, or custom type model",
		required: true,
	},
	variation: { type: "string", description: 'Slice variation ID (default: "default")' },
	tab: { type: "string", description: 'Page or custom type tab name (default: "Main")' },
} satisfies CommandConfig["options"];

export async function resolveModel(
	values: { to: string; variation?: string; tab?: string },
	config: { adapter: Adapter; targetType?: "slice" | "customType" },
): Promise<Target> {
	const { to = "", variation = "default", tab = "Main" } = values;
	const { adapter, targetType } = config;

	const resolvedTo = appendTrailingSlash(
		new URL(to, appendTrailingSlash(pathToFileURL(process.cwd()))),
	);

	const slices = await adapter.getSlices();
	const slice = slices.find((s) => {
		return (
			new URL("model.json", s.directory).href ===
			(resolvedTo.pathname.endsWith("/model.json")
				? resolvedTo.href
				: new URL("model.json", resolvedTo).href)
		);
	});
	if (slice) {
		if (targetType === "customType") {
			throw new CommandError(
				"This field can only be added to page types or custom types, not slices.",
			);
		}
		if ("tab" in values) {
			throw new CommandError("--tab is only valid for page or custom types.");
		}

		const newModel = structuredClone(slice.model);
		const newVariation = newModel.variations?.find((v) => v.id === variation);
		if (!newVariation) {
			const variationIds = slice.model.variations?.map((v) => v.id).join(", ") || "(none)";
			throw new CommandError(`Variation "${variation}" not found. Available: ${variationIds}`);
		}
		newVariation.primary ??= {};

		return [newVariation.primary, () => adapter.updateSlice(newModel)];
	}

	const customTypes = await adapter.getCustomTypes();
	const customType = customTypes.find(
		(c) =>
			new URL("index.json", c.directory).href ===
			(resolvedTo.pathname.endsWith("/index.json")
				? resolvedTo.href
				: new URL("index.json", resolvedTo).href),
	);
	if (customType) {
		if ("variation" in values) {
			throw new CommandError("--variation is only valid for slices.");
		}

		const newModel = structuredClone(customType.model);
		const newTab = newModel.json[tab];
		if (!newTab) {
			const tabNames = Object.keys(customType.model.json).join(", ") || "(none)";
			throw new CommandError(`Tab "${tab}" not found. Available: ${tabNames}`);
		}

		return [newTab, () => adapter.updateCustomType(newModel)];
	}

	const projectRoot = await findProjectRoot();
	const relativeTo = relativePathname(projectRoot, resolvedTo);

	throw new CommandError(`There is no model at ${relativeTo}.`);
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
