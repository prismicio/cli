import type {
	DynamicCustomTypeModel,
	DynamicSlicesModel,
	SharedSliceModel,
	SharedSliceModelVariation,
} from "@prismicio/types-internal";
import { camelCase, pascalCase } from "change-case";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { dedent, formatTable } from "../lib/string";
import { relativePathname } from "../lib/url";
import { findProjectRoot } from "../project";

const config = {
	name: "prismic slice migrate",
	description: `
		Convert a legacy slice to a shared slice.

		Legacy slices are defined inside a type's slice zone. They come from the
		Legacy Builder and cannot be edited with the CLI or the Type Builder.

		Without arguments, the command lists the legacy slices in the project and
		the command to convert each one.

		The conversion changes local models only. Documents keep their content.
		After \`prismic push\`, Prismic returns legacy content in the shape of the
		shared slice. Update the slice component, then deploy it together with
		\`prismic push\`.
	`,
	sections: {
		EXAMPLES: `
			List legacy slices:
			  prismic slice migrate

			Convert a legacy slice to a new shared slice with the same ID:
			  prismic slice migrate hero --from blog_post

			Add a legacy slice as a variation of an existing shared slice:
			  prismic slice migrate hero --from landing_page --to hero --variation landing

			Merge a legacy slice into an identical variation of a shared slice:
			  prismic slice migrate hero --from landing_page --to hero --variation default
		`,
	},
	positionals: {
		id: { description: "ID of the legacy slice in the slice zone" },
	},
	options: {
		from: { type: "string", description: "ID of the type that contains the legacy slice" },
		"slice-zone": {
			type: "string",
			description: "Slice zone field ID (default: the zone that contains the legacy slice)",
		},
		id: {
			type: "string",
			description: "ID of the new shared slice (default: the legacy slice ID)",
		},
		to: {
			type: "string",
			description: "ID of an existing shared slice to add the legacy slice to",
		},
		variation: {
			type: "string",
			description:
				"Variation ID. With --to, an existing variation with the same fields is merged; a new ID adds a variation.",
		},
		json: { type: "boolean", description: "Output the list of legacy slices as JSON" },
	},
} satisfies CommandConfig;

type SliceChoice = NonNullable<NonNullable<DynamicSlicesModel["config"]>["choices"]>[string];
type LegacySliceChoice = Exclude<SliceChoice, { type: "SharedSlice" }>;

type LegacySlice = {
	customTypeId: string;
	tabId: string;
	sliceZoneId: string;
	sliceId: string;
	model: LegacySliceChoice;
};

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { from, "slice-zone": sliceZoneId, id: newSliceId, to, variation, json } = values;

	const adapter = await getAdapter();
	const customTypes = (await adapter.getCustomTypes()).map((customType) => customType.model);
	const slices = (await adapter.getSlices()).map((slice) => slice.model);
	const legacySlices = customTypes.flatMap(getLegacySlices);

	if (!id) {
		printLegacySlices(legacySlices, slices, json);
		return;
	}

	if (newSliceId && to) {
		throw new CommandError("Use either --id or --to, not both.");
	}
	if (variation && !to && variation !== "default") {
		throw new CommandError(
			"--variation needs --to. A new shared slice has one variation: default.",
		);
	}

	const matches = legacySlices.filter(
		(legacySlice) =>
			legacySlice.sliceId === id &&
			(!from || legacySlice.customTypeId === from) &&
			(!sliceZoneId || legacySlice.sliceZoneId === sliceZoneId),
	);
	if (matches.length === 0) {
		throw new CommandError(
			`Legacy slice "${id}" not found${from ? ` in "${from}"` : ""}. Run \`prismic slice migrate\` to list legacy slices.`,
		);
	}
	if (matches.length > 1) {
		const locations = matches.map((match) => `  - ${match.customTypeId} (${match.sliceZoneId})`);
		throw new CommandError(dedent`
			Legacy slice "${id}" is in more than one slice zone:
			${locations.join("\n")}

			Use --from and --slice-zone to choose one.
		`);
	}
	const [legacySlice] = matches;
	const legacyPath = `${legacySlice.customTypeId}::${legacySlice.sliceZoneId}::${legacySlice.sliceId}`;

	let slice: SharedSliceModel;
	let summary: string;
	if (to) {
		const existing = slices.find((s) => s.id === to);
		if (!existing) {
			throw new CommandError(`Slice "${to}" not found. Omit --to to create a new shared slice.`);
		}
		slice = existing;

		const converted = toVariation(legacySlice, variation ?? camelCase(legacySlice.sliceId));
		const target = variation
			? slice.variations.find((v) => v.id === variation)
			: slice.variations.find((v) => hasSameFields(v, converted));

		if (target) {
			if (!hasSameFields(target, converted)) {
				throw new CommandError(dedent`
					Variation "${target.id}" of slice "${to}" has different fields than legacy slice "${id}".
					Only a variation with the same fields can be merged.

					Use a new variation ID with --variation to add the legacy slice as a variation.
				`);
			}
			summary = `Merged legacy slice "${id}" into variation "${target.id}" of slice "${to}"`;
			slice.legacyPaths = { ...slice.legacyPaths, [legacyPath]: target.id };
		} else {
			if (slice.variations.some((v) => v.id === converted.id)) {
				throw new CommandError(
					`Variation "${converted.id}" already exists in slice "${to}". Use --variation to choose another ID.`,
				);
			}
			summary = `Added legacy slice "${id}" to slice "${to}" as variation "${converted.id}"`;
			slice.variations.push(converted);
			slice.legacyPaths = { ...slice.legacyPaths, [legacyPath]: converted.id };
		}

		await adapter.updateSlice(slice);
	} else {
		const sliceId = newSliceId ?? legacySlice.sliceId;
		if (slices.some((s) => s.id === sliceId)) {
			throw new CommandError(dedent`
				Slice "${sliceId}" already exists.

				Do one of the following:
				  - Add the legacy slice to it: prismic slice migrate ${id} --from ${legacySlice.customTypeId} --to ${sliceId}
				  - Create a slice with another ID: prismic slice migrate ${id} --from ${legacySlice.customTypeId} --id <new-id>
			`);
		}

		slice = {
			id: sliceId,
			type: "SharedSlice",
			name: pascalCase(getLegacySliceName(legacySlice) ?? sliceId),
			legacyPaths: { [legacyPath]: "default" },
			variations: [toVariation(legacySlice, "default")],
		};
		summary = `Created slice "${sliceId}" from legacy slice "${id}"`;

		await adapter.createSlice(slice);
	}

	const customType = customTypes.find((ct) => ct.id === legacySlice.customTypeId)!;
	replaceChoice(customType, legacySlice, slice.id);
	await adapter.updateCustomType(customType);
	await adapter.generateTypes();

	const { directory } = await adapter.getSlice(slice.id);
	const componentPath = relativePathname(await findProjectRoot(), directory);
	const variationId = slice.legacyPaths?.[legacyPath] ?? "default";
	const remaining = legacySlices.length - 1;

	console.info(summary);
	console.info("\nContent changes after `prismic push`:");
	for (const change of getContentChanges(legacySlice, slice.id, variationId)) {
		console.info(`  - ${change}`);
	}
	console.info(dedent`

		Next steps:
		  1. Update the slice component in ${componentPath} for these changes.
		  2. Deploy the component together with \`prismic push\`. Documents use the new shape after the next publish, even documents that nobody edits.
	`);
	if (remaining > 0) {
		console.info(
			`\n${remaining} legacy ${remaining === 1 ? "slice remains" : "slices remain"}. Run \`prismic slice migrate\` to list them.`,
		);
	}
});

function getContentChanges(
	legacySlice: LegacySlice,
	sliceId: string,
	variationId: string,
): string[] {
	const { model, sliceId: legacySliceId } = legacySlice;
	const changes: string[] = [];
	if (sliceId !== legacySliceId) {
		changes.push(
			`\`slice_type\` changes from "${legacySliceId}" to "${sliceId}". The "${sliceId}" component renders this content.`,
		);
	}
	changes.push(`\`variation\` is "${variationId}".`);
	if (model.type === "Group") {
		changes.push("The repeatable fields move from `slice.value` to `slice.items`.");
	} else if (model.type !== "Slice") {
		changes.push(
			`The field value moves from \`slice.value\` to \`slice.primary.${legacySliceId}\`.`,
		);
	} else {
		changes.push("`slice.primary` and `slice.items` do not change.");
	}
	return changes;
}

function getLegacySlices(customType: DynamicCustomTypeModel): LegacySlice[] {
	return Object.entries(customType.json).flatMap(([tabId, tab]) =>
		Object.entries(tab).flatMap(([sliceZoneId, field]) => {
			if (field.type !== "Slices") return [];
			return Object.entries(field.config?.choices ?? {}).flatMap(([sliceId, model]) =>
				model.type === "SharedSlice"
					? []
					: [{ customTypeId: customType.id, tabId, sliceZoneId, sliceId, model }],
			);
		}),
	);
}

// Mirrors Slice Machine's legacy slice upgrader so Prismic reads existing
// content the same way through `legacyPaths`.
function toVariation(legacySlice: LegacySlice, id: string): SharedSliceModelVariation {
	const { model, sliceId } = legacySlice;
	const name = id === "default" ? "Default" : pascalCase(id);
	const variation: SharedSliceModelVariation = {
		id,
		name,
		description: name,
		docURL: "",
		imageUrl: "",
		version: "initial",
		primary: {},
		items: {},
	};

	switch (model.type) {
		case "Slice":
			variation.primary = model["non-repeat"] ?? {};
			variation.items = model.repeat ?? {};
			break;
		case "Group":
			variation.items = model.config?.fields ?? {};
			break;
		default:
			variation.primary = { [sliceId]: model };
			break;
	}

	return variation;
}

function getLegacySliceName({ model }: LegacySlice): string | undefined {
	if (model.type === "Slice" || model.type === "Group") return model.fieldset ?? undefined;
	return undefined;
}

function hasSameFields(a: SharedSliceModelVariation, b: SharedSliceModelVariation): boolean {
	return (
		sortedJSON(a.primary ?? {}) === sortedJSON(b.primary ?? {}) &&
		sortedJSON(a.items ?? {}) === sortedJSON(b.items ?? {})
	);
}

function sortedJSON(value: unknown): string {
	return JSON.stringify(value, (_key, v: unknown) =>
		v && typeof v === "object" && !Array.isArray(v)
			? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
			: v,
	);
}

// Keeps the slice at the same position in the zone. Choice order is slice order.
function replaceChoice(
	customType: DynamicCustomTypeModel,
	legacySlice: LegacySlice,
	sliceId: string,
): void {
	const field = customType.json[legacySlice.tabId][legacySlice.sliceZoneId];
	if (field.type !== "Slices" || !field.config?.choices) return;

	const choices: typeof field.config.choices = {};
	for (const [key, choice] of Object.entries(field.config.choices)) {
		if (key === legacySlice.sliceId) {
			choices[sliceId] = { type: "SharedSlice" };
		} else if (key !== sliceId) {
			choices[key] = choice;
		}
	}
	field.config.choices = choices;
}

function printLegacySlices(
	legacySlices: LegacySlice[],
	slices: SharedSliceModel[],
	json: boolean | undefined,
): void {
	// Suggest one command per legacy slice. The first legacy slice with an ID
	// creates the shared slice, and later ones with that ID are added to it.
	const plannedSliceIds = new Set(slices.map((slice) => slice.id));
	const rows = legacySlices.map((legacySlice) => {
		const { customTypeId, sliceZoneId, sliceId, model } = legacySlice;
		const exists = plannedSliceIds.has(sliceId);
		plannedSliceIds.add(sliceId);
		const command = exists
			? `prismic slice migrate ${sliceId} --from ${customTypeId} --to ${sliceId}`
			: `prismic slice migrate ${sliceId} --from ${customTypeId}`;
		return { customTypeId, sliceZoneId, sliceId, kind: model.type, command };
	});

	if (json) {
		console.info(stringify(rows));
		return;
	}

	if (rows.length === 0) {
		console.info("No legacy slices found.");
		return;
	}

	console.info(
		formatTable(
			rows.map((row) => [row.sliceId, row.customTypeId, row.sliceZoneId, row.kind, row.command]),
			{ headers: ["ID", "TYPE", "SLICE ZONE", "KIND", "COMMAND"] },
		),
	);
	console.info(
		"\nConvert one slice at a time. After each one, update its component and test your website.",
	);
}
