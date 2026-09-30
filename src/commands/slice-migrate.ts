import { isDeepStrictEqual } from "node:util";

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
import { formatTable } from "../lib/string";
import { relativePathname } from "../lib/url";
import { findProjectRoot } from "../project";

const config = {
	name: "prismic slice migrate",
	description: `
		Convert a legacy slice to a shared slice.

		Legacy slices come from the Legacy Builder. The CLI and the Type Builder
		cannot edit them. Without an ID, the command lists them.

		Only local models change. After \`prismic push\`, Prismic returns their
		content in the shared slice shape, so deploy the updated component with
		the push.
	`,
	sections: {
		EXAMPLES: `
			List legacy slices:
			  prismic slice migrate

			Convert a legacy slice to a shared slice with the same ID:
			  prismic slice migrate hero --from blog_post

			Add a legacy slice to an existing shared slice:
			  prismic slice migrate hero --from landing_page --to hero
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
		to: {
			type: "string",
			description: "ID of an existing shared slice to add the legacy slice to",
		},
		variation: {
			type: "string",
			description: "Variation of --to to merge into or create (default: one with the same fields)",
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
	const { from, "slice-zone": sliceZoneId, to, variation, json } = values;

	const adapter = await getAdapter();
	const customTypes = (await adapter.getCustomTypes()).map((customType) => customType.model);
	const slices = (await adapter.getSlices()).map((slice) => slice.model);
	const legacySlices = customTypes.flatMap(getLegacySlices);

	if (!id) {
		printLegacySlices(legacySlices, slices, json);
		return;
	}

	if (variation && !to) {
		throw new CommandError("--variation needs --to.");
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
		throw new CommandError(
			`Legacy slice "${id}" is in more than one slice zone. Use --from and --slice-zone to choose one.`,
		);
	}
	const [legacySlice] = matches;
	const legacyPath = `${legacySlice.customTypeId}::${legacySlice.sliceZoneId}::${legacySlice.sliceId}`;

	let slice: SharedSliceModel;
	let variationId = "default";
	let summary: string;
	if (to) {
		const existing = slices.find((s) => s.id === to);
		if (!existing) {
			throw new CommandError(`Slice "${to}" not found. Omit --to to create a new shared slice.`);
		}
		slice = existing;

		const converted = toVariation(legacySlice, variation ?? camelCase(id));
		const target = slice.variations.find((v) =>
			variation ? v.id === variation : hasSameFields(v, converted),
		);
		if (target && !hasSameFields(target, converted)) {
			throw new CommandError(
				`Variation "${target.id}" of slice "${to}" has different fields than legacy slice "${id}". Use a new variation ID with --variation.`,
			);
		}
		if (target) {
			variationId = target.id;
			summary = `Merged legacy slice "${id}" into variation "${variationId}" of slice "${to}"`;
		} else {
			if (slice.variations.some((v) => v.id === converted.id)) {
				throw new CommandError(
					`Variation "${converted.id}" already exists in slice "${to}". Use --variation to choose another ID.`,
				);
			}
			variationId = converted.id;
			slice.variations.push(converted);
			summary = `Added legacy slice "${id}" to slice "${to}" as variation "${variationId}"`;
		}
		slice.legacyPaths = { ...slice.legacyPaths, [legacyPath]: variationId };
		await adapter.updateSlice(slice);
	} else {
		if (slices.some((s) => s.id === id)) {
			throw new CommandError(
				`Slice "${id}" already exists. Add the legacy slice to it with --to ${id}.`,
			);
		}

		const { model } = legacySlice;
		const name = model.type === "Slice" || model.type === "Group" ? model.fieldset : undefined;
		slice = {
			id,
			type: "SharedSlice",
			name: pascalCase(name ?? id),
			legacyPaths: { [legacyPath]: variationId },
			variations: [toVariation(legacySlice, variationId)],
		};
		summary = `Created slice "${id}"`;
		await adapter.createSlice(slice);
	}

	const customType = customTypes.find((ct) => ct.id === legacySlice.customTypeId)!;
	replaceChoice(customType, legacySlice, slice.id);
	await adapter.updateCustomType(customType);
	await adapter.generateTypes();

	const { directory } = await adapter.getSlice(slice.id);
	const componentPath = relativePathname(await findProjectRoot(), directory);
	const remaining = legacySlices.length - 1;

	console.info(summary);
	console.info(`After \`prismic push\`: ${getContentChange(legacySlice, slice.id, variationId)}`);
	console.info(
		`Update the component in ${componentPath}, then deploy it with \`prismic push\`. Documents use the new shape after the next publish.`,
	);
	if (remaining > 0) {
		console.info(
			`\n${remaining} legacy ${remaining === 1 ? "slice remains" : "slices remain"}. Run \`prismic slice migrate\` to list them.`,
		);
	}
});

function getContentChange(legacySlice: LegacySlice, sliceId: string, variationId: string) {
	const { model, sliceId: legacySliceId } = legacySlice;
	const changes = [];
	if (sliceId !== legacySliceId || variationId !== "default") {
		changes.push(`\`slice_type\` becomes "${sliceId}" and \`variation\` becomes "${variationId}".`);
	}
	if (model.type === "Group") changes.push("`slice.value` moves to `slice.items`.");
	else if (model.type !== "Slice")
		changes.push(`\`slice.value\` moves to \`slice.primary.${legacySliceId}\`.`);
	return changes.join(" ") || "`slice.primary` and `slice.items` keep their shape.";
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

function hasSameFields(a: SharedSliceModelVariation, b: SharedSliceModelVariation): boolean {
	return (
		isDeepStrictEqual(a.primary ?? {}, b.primary ?? {}) &&
		isDeepStrictEqual(a.items ?? {}, b.items ?? {})
	);
}

// Keeps the slice at the same position in the zone. Choice order is slice order.
function replaceChoice(
	customType: DynamicCustomTypeModel,
	legacySlice: LegacySlice,
	sliceId: string,
) {
	const field = customType.json[legacySlice.tabId][legacySlice.sliceZoneId];
	if (field.type !== "Slices") return;
	field.config!.choices = Object.fromEntries(
		Object.entries(field.config!.choices!)
			.filter(([key]) => key === legacySlice.sliceId || key !== sliceId)
			.map(([key, choice]) =>
				key === legacySlice.sliceId ? [sliceId, { type: "SharedSlice" }] : [key, choice],
			),
	);
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
}
