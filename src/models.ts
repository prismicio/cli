import type { Adapter } from "./adapters";
import type { CommandConfig } from "./lib/command";

import { CommandError } from "./lib/command";

type Field = {
	type: string;
	config?: {
		label?: string | null;
	};
};
type Fields = Record<string, Field>;
type Target = [fields: Fields, save: () => Promise<void>];

export const TARGET_OPTIONS = {
	slice: { type: "string", description: "Slice ID" },
	variation: { type: "string", description: "Slice variation ID" },
	"page-type": { type: "string", description: "Page type ID" },
	"custom-type": { type: "string", description: "Custom type ID" },
	tab: { type: "string", description: "Page or custom type tab name" },
} satisfies CommandConfig["options"];

export async function resolveModel(
	adapter: Adapter,
	flags: {
		slice?: string;
		variation?: string;
		"custom-type"?: string;
		"page-type"?: string;
		tab?: string;
	},
): Promise<Target> {
	const {
		slice: sliceId,
		variation: variationId = "default",
		"page-type": pageTypeId,
		"custom-type": customTypeId,
		tab = "Main",
	} = flags;

	const targets = [sliceId, customTypeId, pageTypeId].filter(Boolean);
	if (targets.length === 0) {
		throw new CommandError(
			"Missing target flag. Provide one of --slice, --custom-type, or --page-type.",
		);
	}
	if (targets.length > 1) {
		throw new CommandError("Flags --slice, --custom-type, and --page-type are mutually exclusive.");
	}

	if (sliceId) {
		if (tab) {
			throw new CommandError("--tab is only valid with --page-type or --custom-type.");
		}

		const slice = await adapter.getSlice(sliceId);
		const newModel = structuredClone(slice.model);

		const newVariation = newModel.variations?.find((v) => v.id === variationId);
		if (!newVariation) {
			const variationIds = slice.model.variations?.map((v) => v.id).join(", ") || "none";
			throw new CommandError(`Variation "${variationId}" not found. Available: ${variationIds}`);
		}

		newVariation.primary ??= {};

		return [newVariation.primary, () => adapter.updateSlice(newModel)];
	}

	const typeId = pageTypeId ?? customTypeId;
	if (typeId) {
		if (flags.variation) {
			throw new CommandError("--variation is only valid with --slice.");
		}

		const customType = await adapter.getCustomType(typeId);
		const newModel = structuredClone(customType.model);

		const newTab = newModel.json[tab];
		if (!newTab) {
			const tabNames = Object.keys(customType.model.json).join(", ") || "none";
			throw new CommandError(`Tab "${tab}" not found. Available: ${tabNames}`);
		}

		return [newTab, () => adapter.updateCustomType(newModel)];
	}

	throw new CommandError("This is a bug. Please verify your command and try again.");
}
