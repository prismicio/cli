import type { DynamicCustomTypeModel, DynamicSlicesModel } from "@prismicio/types-internal";

type SliceChoice = NonNullable<NonNullable<DynamicSlicesModel["config"]>["choices"]>[string];

export type LegacySlice = {
	id: string;
	customTypeId: string;
	tabId: string;
	sliceZoneId: string;
	model: Exclude<SliceChoice, { type: "SharedSlice" }>;
};

/** Slices defined inside a slice zone by the Legacy Builder. */
export function getLegacySlices(customTypes: DynamicCustomTypeModel[]): LegacySlice[] {
	return customTypes.flatMap((customType) =>
		Object.entries(customType.json).flatMap(([tabId, tab]) =>
			Object.entries(tab).flatMap(([sliceZoneId, field]) => {
				if (field.type !== "Slices") return [];
				return Object.entries(field.config?.choices ?? {}).flatMap(([id, model]) =>
					model.type === "SharedSlice"
						? []
						: [{ id, customTypeId: customType.id, tabId, sliceZoneId, model }],
				);
			}),
		),
	);
}
