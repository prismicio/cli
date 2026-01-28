export type FieldPath =
	| { type: "top-level"; fieldId: string }
	| { type: "nested"; groupId: string; nestedFieldId: string };

export function parseFieldPath(fieldId: string): FieldPath {
	const parts = fieldId.split(".");

	if (parts.length === 1) {
		return { type: "top-level", fieldId };
	}

	if (parts.length === 2) {
		return { type: "nested", groupId: parts[0], nestedFieldId: parts[1] };
	}

	// More than 2 parts means nested groups which aren't supported
	return { type: "nested", groupId: parts[0], nestedFieldId: parts.slice(1).join(".") };
}

export type GroupFieldResult =
	| { ok: true; group: { config: { fields: Record<string, unknown> } } }
	| { ok: false; error: string };

export function isGroupField(field: unknown): field is { type: "Group"; config: { fields: Record<string, unknown> } } {
	return (
		typeof field === "object" &&
		field !== null &&
		"type" in field &&
		field.type === "Group" &&
		"config" in field &&
		typeof field.config === "object" &&
		field.config !== null &&
		"fields" in field.config
	);
}

export function findGroupInTab(
	tabFields: Record<string, unknown>,
	groupId: string,
	tabName: string,
): GroupFieldResult {
	const field = tabFields[groupId];

	if (!field) {
		return { ok: false, error: `Group "${groupId}" not found in tab "${tabName}"` };
	}

	if (!isGroupField(field)) {
		return { ok: false, error: `Field "${groupId}" is not a group` };
	}

	return { ok: true, group: field };
}

export function findGroupInVariation(
	primary: Record<string, unknown>,
	groupId: string,
	variationId: string,
): GroupFieldResult {
	const field = primary[groupId];

	if (!field) {
		return { ok: false, error: `Group "${groupId}" not found in variation "${variationId}"` };
	}

	if (!isGroupField(field)) {
		return { ok: false, error: `Field "${groupId}" is not a group` };
	}

	return { ok: true, group: field };
}

export function validateNestedFieldPath(fieldPath: FieldPath): { ok: true } | { ok: false; error: string } {
	if (fieldPath.type === "nested" && fieldPath.nestedFieldId.includes(".")) {
		return {
			ok: false,
			error: `Nested groups not supported. Use: group.field`,
		};
	}
	return { ok: true };
}
