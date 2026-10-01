import { isDeepStrictEqual } from "node:util";

import type { SharedSliceModel, SharedSliceModelVariation } from "@prismicio/types-internal";
import { camelCase, pascalCase, snakeCase } from "change-case";

import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { getLegacySlices, type LegacySlice } from "../lib/prismic/models";
import { relativePathname } from "../lib/url";
import { findProjectRoot } from "../project";

const config = {
	name: "prismic slice upgrade-legacy",
	description: `
		Upgrade a legacy slice from the Legacy Builder.

		The CLI and the Type Builder cannot edit legacy slices. Run
		\`prismic slice list --legacy\` to list them.

		Each legacy slice becomes its own slice unless --to names an existing
		slice, which gets it as a new variation. Legacy slices with the same ID
		in several types are often the same component. Ask the user whether to
		combine them into one slice or keep them separate before upgrading them.

		Only local models change. After \`prismic push\`, Prismic returns the
		slice's content in its upgraded shape, so deploy the updated component
		with the push.
	`,
	sections: {
		EXAMPLES: `
			Upgrade a legacy slice:
			  prismic slice upgrade-legacy hero --from blog_post

			Upgrade a legacy slice that is not in the "body" slice zone:
			  prismic slice upgrade-legacy hero --from blog_post --slice-zone page_slices

			Add a legacy slice to an existing slice as a new variation:
			  prismic slice upgrade-legacy hero --from landing_page --to hero --variation landing

			Merge a legacy slice into an existing variation with the same fields:
			  prismic slice upgrade-legacy hero --from landing_page --to hero --variation default
		`,
	},
	positionals: {
		id: { description: "ID of the legacy slice", required: true },
	},
	options: {
		from: {
			type: "string",
			required: true,
			description: "ID of the type that contains the legacy slice",
		},
		"slice-zone": {
			type: "string",
			description: 'Slice zone field ID (default: "body")',
		},
		to: {
			type: "string",
			description:
				"ID of the slice to upgrade to, created if missing (default: the legacy slice ID)",
		},
		variation: {
			type: "string",
			description:
				'Variation to create, or to merge into if it has the same fields (default: "default" for a new slice, the legacy slice ID otherwise)',
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { from, "slice-zone": sliceZoneId = "body", to, variation } = values;

	const adapter = await getAdapter();
	const customTypes = (await adapter.getCustomTypes()).map((customType) => customType.model);
	const slices = (await adapter.getSlices()).map((slice) => slice.model);
	const legacySlices = getLegacySlices(customTypes);

	const customType = customTypes.find((ct) => ct.id === from);
	if (!customType) {
		throw new CommandError(`Type "${from}" not found.`);
	}
	const legacySlice = legacySlices.find(
		(s) => s.customTypeId === from && s.sliceZoneId === sliceZoneId && s.id === id,
	);
	if (!legacySlice) {
		throw new CommandError(
			`Legacy slice "${id}" not found in the "${sliceZoneId}" slice zone of "${from}". Use --slice-zone to choose the slice zone.`,
		);
	}
	const legacyPath = `${from}::${sliceZoneId}::${id}`;

	const sliceId = to ?? snakeCase(id);
	const zoneChoice = legacySlice.sliceZone.config?.choices?.[sliceId];
	if (sliceId !== id && zoneChoice && zoneChoice.type !== "SharedSlice") {
		throw new CommandError(
			`The "${sliceZoneId}" slice zone of "${from}" also has legacy slice "${sliceId}". Upgrade it first.`,
		);
	}
	let slice = slices.find((s) => s.id === sliceId);
	const variationId = camelCase(variation ?? (slice ? id : "default"));
	const upgraded = toVariation(legacySlice, variationId);
	let summary: string;
	if (slice) {
		if (!to) {
			throw new CommandError(getSliceExistsMessage(slice, legacySlice, upgraded));
		}
		const target = slice.variations.find((v) => v.id === variationId);
		if (target && !hasSameFields(target, upgraded)) {
			throw new CommandError(
				`Variation "${variationId}" of slice "${sliceId}" has different fields than legacy slice "${id}". Use another ID with --variation.`,
			);
		}
		if (target) {
			summary = `Merged legacy slice "${id}" into variation "${variationId}" of slice "${sliceId}"`;
		} else {
			slice.variations.push(upgraded);
			summary = `Added legacy slice "${id}" to slice "${sliceId}" as variation "${variationId}"`;
		}
		slice.legacyPaths = { ...slice.legacyPaths, [legacyPath]: variationId };
		await adapter.updateSlice(slice);
	} else {
		const { model } = legacySlice;
		const name = "fieldset" in model ? model.fieldset : undefined;
		slice = {
			id: sliceId,
			type: "SharedSlice",
			name: pascalCase(to ?? name ?? sliceId),
			legacyPaths: { [legacyPath]: variationId },
			variations: [upgraded],
		};
		summary = `Upgraded legacy slice "${id}" to slice "${sliceId}"`;
		await adapter.createSlice(slice);
	}

	replaceChoice(legacySlice, slice.id);
	await adapter.updateCustomType(customType);
	await adapter.generateTypes();

	const { directory } = await adapter.getSlice(slice.id);
	const componentPath = relativePathname(await findProjectRoot(), directory);
	const remaining = legacySlices.length - 1;

	console.info(summary);
	console.info(`After \`prismic push\`: ${getContentChange(legacySlice, sliceId, variationId)}`);
	console.info(
		`Update the component in ${componentPath}, then deploy it with \`prismic push\`. Documents use the new shape after the next publish.`,
	);
	if (remaining > 0) {
		console.info(
			`\n${remaining} legacy ${remaining === 1 ? "slice remains" : "slices remain"}. Run \`prismic slice list --legacy\` to list them.`,
		);
	}
});

// Upgrading into an existing slice changes how editors use it, so the user decides.
function getSliceExistsMessage(
	slice: SharedSliceModel,
	legacySlice: LegacySlice,
	upgraded: SharedSliceModelVariation,
) {
	const { id, customTypeId, sliceZoneId } = legacySlice;
	const zoneOption = sliceZoneId === "body" ? "" : ` --slice-zone ${sliceZoneId}`;
	const command = `prismic slice upgrade-legacy ${id} --from ${customTypeId}${zoneOption}`;
	const sameFields = slice.variations.find((v) => hasSameFields(v, upgraded));
	return [
		`Slice "${slice.id}" already exists. Ask the user how to upgrade legacy slice "${id}" of "${customTypeId}":`,
		`  Add it to slice "${slice.id}" as a new variation: ${command} --to ${slice.id}`,
		...(sameFields
			? [
					`  Merge it into variation "${sameFields.id}", which has the same fields: ${command} --to ${slice.id} --variation ${sameFields.id}`,
				]
			: []),
		`  Upgrade it to a separate slice: ${command} --to <new-slice-id>`,
	].join("\n");
}

function getContentChange(legacySlice: LegacySlice, sliceId: string, variationId: string) {
	const { model, id } = legacySlice;
	const changes = [];
	if (sliceId !== id || variationId !== "default") {
		changes.push(`\`slice_type\` becomes "${sliceId}" and \`variation\` becomes "${variationId}".`);
	}
	if (model.type === "Group") changes.push("`slice.value` moves to `slice.items`.");
	else if (model.type !== "Slice")
		changes.push(`\`slice.value\` moves to \`slice.primary.${id}\`.`);
	return changes.join(" ") || "`slice.primary` and `slice.items` keep their shape.";
}

// Mirrors Slice Machine's legacy slice upgrader so Prismic reads existing
// content the same way through `legacyPaths`.
function toVariation(legacySlice: LegacySlice, id: string): SharedSliceModelVariation {
	const { model } = legacySlice;
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
			variation.primary = { [legacySlice.id]: model };
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
function replaceChoice({ id, sliceZone }: LegacySlice, sliceId: string) {
	sliceZone.config!.choices = Object.fromEntries(
		Object.entries(sliceZone.config!.choices!)
			.filter(([key]) => key === id || key !== sliceId)
			.map(([key, choice]) => (key === id ? [sliceId, { type: "SharedSlice" }] : [key, choice])),
	);
}
