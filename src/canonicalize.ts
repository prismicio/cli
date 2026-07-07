import type { CustomType, DynamicWidget, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

type Field = DynamicWidget;
type Fields = Record<string, Field>;
type Variation = SharedSlice["variations"][number];

/**
 * Returns a copy of a model with object keys sorted alphabetically, so models
 * stay stable on disk and compare equal regardless of the key order the Prismic
 * API returns them in.
 *
 * Only keys whose order has no meaning are sorted: model metadata, field
 * definitions, and field config. The order of tabs, and of fields within a tab,
 * a group, or a slice variation, is preserved because that order is meaningful.
 */
export function canonicalizeCustomType(model: CustomType): CustomType {
	return { ...sortKeys(model), json: mapValues(model.json, canonicalizeFields) };
}

export function canonicalizeSlice(model: SharedSlice): SharedSlice {
	return { ...sortKeys(model), variations: model.variations.map(canonicalizeVariation) };
}

function canonicalizeVariation(variation: Variation): Variation {
	const sorted = sortKeys(variation);
	if (sorted.primary) sorted.primary = canonicalizeFields(sorted.primary);
	if (sorted.items) sorted.items = canonicalizeFields(sorted.items);
	return sorted;
}

function canonicalizeFields<F extends Field>(fields: Record<string, F>): Record<string, F> {
	return mapValues(fields, canonicalizeField);
}

function canonicalizeField<F extends Field>(field: F): F {
	const sorted = sortKeys(field);
	if ("config" in sorted && sorted.config) sorted.config = canonicalizeConfig(sorted.config);
	return sorted;
}

function canonicalizeConfig<C extends Record<string, unknown>>(config: C): C {
	const sorted = sortKeys(config);
	// Only group fields nest a field map under `config.fields`; preserve its order.
	const group = sorted as { fields?: Fields };
	if (group.fields) group.fields = canonicalizeFields(group.fields);
	return sorted;
}

function sortKeys<T>(object: T): T {
	return Object.fromEntries(
		Object.entries(object as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
	) as T;
}

function mapValues<T>(record: Record<string, T>, fn: (value: T) => T): Record<string, T> {
	return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, fn(value)]));
}
