import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getLegacySlices } from "../lib/prismic/legacySlices";
import { formatTable } from "../lib/string";

const config = {
	name: "prismic slice list",
	description: `
		List all slices.

		Legacy slices from the Legacy Builder are marked with * and show the type
		that defines them.
	`,
	options: {
		legacy: { type: "boolean", description: "List only legacy slices" },
		json: { type: "boolean", description: "Output as JSON" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ values }) => {
	const { legacy, json } = values;

	const adapter = await getAdapter();
	const slices = legacy ? [] : (await adapter.getSlices()).map((slice) => slice.model);
	const customTypes = (await adapter.getCustomTypes()).map((customType) => customType.model);
	const legacySlices = getLegacySlices(customTypes);

	if (json) {
		console.info(
			stringify(
				legacy
					? legacySlices.map((s) => ({
							id: s.id,
							definedIn: s.customTypeId,
							sliceZone: s.sliceZoneId,
						}))
					: slices,
			),
		);
		return;
	}

	if (slices.length === 0 && legacySlices.length === 0) {
		console.info(legacy ? "No legacy slices found." : "No slices found.");
		return;
	}

	const rows = [
		...slices.map((slice) => [slice.name, slice.id, ""]),
		...legacySlices.map(({ id, model, customTypeId, sliceZoneId }) => {
			const name = "fieldset" in model ? model.fieldset : model.config?.label;
			return [
				`${name || id} *`,
				id,
				sliceZoneId === "body" ? customTypeId : `${customTypeId} (${sliceZoneId} slice zone)`,
			];
		}),
	];
	console.info(formatTable(rows, { headers: ["NAME", "ID", "DEFINED IN"] }));
	if (legacySlices.length > 0) {
		console.info("\n* Legacy slice. Run `prismic slice upgrade-legacy --help` to upgrade it.");
	}
});
