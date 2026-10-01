import type { DynamicCustomTypeModel, DynamicSlicesModel } from "@prismicio/types-internal";

type SliceChoice = NonNullable<NonNullable<DynamicSlicesModel["config"]>["choices"]>[string];

export type LegacySlice = {
	id: string;
	customTypeId: string;
	sliceZoneId: string;
	sliceZone: DynamicSlicesModel;
	model: Exclude<SliceChoice, { type: "SharedSlice" }>;
};

/** Slices defined inside a slice zone by the Legacy Builder. */
export function getLegacySlices(customTypes: DynamicCustomTypeModel[]): LegacySlice[] {
	return customTypes.flatMap((customType) =>
		Object.values(customType.json).flatMap((tab) =>
			Object.entries(tab).flatMap(([sliceZoneId, sliceZone]) => {
				if (sliceZone.type !== "Slices") return [];
				return Object.entries(sliceZone.config?.choices ?? {}).flatMap(([id, model]) =>
					model.type === "SharedSlice"
						? []
						: [{ id, customTypeId: customType.id, sliceZoneId, sliceZone, model }],
				);
			}),
		),
	);
}
