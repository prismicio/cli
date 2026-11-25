import type {
	DynamicCustomTypeModel,
	DynamicSlicesModel,
	DynamicWidgetModel,
} from "@prismicio/types-internal";

import { CommandError } from "./lib/command";

export function getSliceZoneChoices(
	customType: DynamicCustomTypeModel,
	sliceZone: string,
): NonNullable<NonNullable<DynamicSlicesModel["config"]>["choices"]> {
	const allFields: Record<string, DynamicWidgetModel> = Object.assign(
		{},
		...Object.values(customType.json),
	);

	const sliceZoneField = allFields[sliceZone];
	if (!sliceZoneField || sliceZoneField.type !== "Slices") {
		const sliceZoneIds = Object.keys(allFields).filter((key) => allFields[key].type === "Slices");
		if (sliceZoneIds.length === 0) {
			const [firstTab = "Main"] = Object.keys(customType.json);
			throw new CommandError(
				`"${customType.id}" has no slice zone. Add one with \`prismic type edit-tab "${firstTab}" --from-type ${customType.id} --with-slice-zone\`, then run this command again.`,
			);
		}
		throw new CommandError(
			`Slice zone "${sliceZone}" not found in "${customType.id}". Use --slice-zone with one of: ${sliceZoneIds.join(", ")}.`,
		);
	}

	sliceZoneField.config ??= {};
	return (sliceZoneField.config.choices ??= {});
}
