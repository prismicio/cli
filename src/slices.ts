import type { DynamicCustomTypeModel, DynamicWidgetModel } from "@prismicio/types-internal";

import { CommandError } from "./lib/command";

export function connectSlices(
	customType: DynamicCustomTypeModel,
	sliceZone: string,
	ids: Iterable<string>,
): void {
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
	sliceZoneField.config.choices ??= {};

	for (const id of ids) {
		if (Object.hasOwn(sliceZoneField.config.choices, id)) {
			throw new CommandError(
				`Slice "${id}" is already connected to "${customType.id}" in slice zone "${sliceZone}".`,
			);
		}
		sliceZoneField.config.choices[id] = { type: "SharedSlice" };
	}
}
