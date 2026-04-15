import { getHost, getToken } from "../auth";
import { getCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldContainer, resolveFieldSelection, resolveFieldTarget, SOURCE_OPTIONS } from "../models";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic field edit",
	description: "Edit an existing field in a slice or custom type.",
	sections: {
		"FIELD TYPE OPTIONS": `
			Options vary by field type. Only options matching the field's
			type will be applied. See \`prismic field add <type> --help\`
			for type-specific option details.
		`,
	},
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...SOURCE_OPTIONS,
		// Universal
		label: { type: "string", description: "Field label" },
		placeholder: { type: "string", description: "Placeholder text" },
		// Boolean
		"default-value": {
			type: "string",
			description: "Default value (boolean: true/false, select: option value)",
		},
		"true-label": { type: "string", description: "Label for true value (boolean)" },
		"false-label": { type: "string", description: "Label for false value (boolean)" },
		// Date / Timestamp
		default: { type: "string", description: "Default value (date/timestamp)" },
		// Number
		min: { type: "string", description: "Minimum value (number)" },
		max: { type: "string", description: "Maximum value (number)" },
		step: { type: "string", description: "Step increment (number)" },
		// Select
		option: {
			type: "string",
			multiple: true,
			description: "Select option value (can be repeated)",
		},
		// Link
		"allow-target-blank": {
			type: "boolean",
			description: "Allow opening in new tab (link/rich-text)",
		},
		"allow-text": {
			type: "boolean",
			description: "Allow custom link text (link)",
		},
		repeatable: { type: "boolean", description: "Allow multiple links (link)" },
		variant: {
			type: "string",
			multiple: true,
			description: "Allowed variant (link/link-to-media, can be repeated)",
		},
		// Content Relationship
		tag: {
			type: "string",
			multiple: true,
			description: "Allowed tag (content-relationship, can be repeated)",
		},
		"custom-type": {
			type: "string",
			multiple: true,
			description: "Allowed custom type (content-relationship, can be repeated)",
		},
		field: {
			type: "string",
			multiple: true,
			description: "Fetch this field from the related document (content-relationship, can be repeated)",
		},
		// Rich Text
		allow: {
			type: "string",
			description: "Comma-separated allowed block types (rich-text)",
		},
		single: { type: "boolean", description: "Restrict to a single block (rich-text)" },
		// Integration
		catalog: { type: "string", description: "Integration catalog ID (integration)" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const [fields, saveModel] = await resolveFieldContainer(id, values, { repo, token, host });
	const [targetFields, fieldId] = resolveFieldTarget(fields, id);

	const field = targetFields[fieldId];
	if (!field) {
		throw new CommandError(`Field "${id}" does not exist.`);
	}
	field.config ??= {};

	if ("label" in values) field.config.label = values.label;
	if ("placeholder" in values)
		(field.config as Record<string, unknown>).placeholder = values.placeholder;

	switch (field.type) {
		case "Boolean": {
			if ("default-value" in values) {
				const raw = values["default-value"];
				if (raw !== "true" && raw !== "false") {
					throw new CommandError('--default-value for boolean fields must be "true" or "false"');
				}
				field.config.default_value = raw === "true";
			}
			if ("true-label" in values) field.config.placeholder_true = values["true-label"];
			if ("false-label" in values) field.config.placeholder_false = values["false-label"];
			break;
		}
		case "Number": {
			if ("min" in values) field.config.min = parseNumber(values.min, "min");
			if ("max" in values) field.config.max = parseNumber(values.max, "max");
			if ("step" in values) field.config.step = parseNumber(values.step, "step");
			break;
		}
		case "Select": {
			if ("default-value" in values) field.config.default_value = values["default-value"];
			if ("option" in values) field.config.options = values.option;
			break;
		}
		case "Date":
		case "Timestamp": {
			if ("default" in values) field.config.default = values.default;
			break;
		}
		case "IntegrationFields": {
			if ("catalog" in values) field.config.catalog = values.catalog;
			break;
		}
		case "StructuredText": {
			if ("allow-target-blank" in values) {
				field.config.allowTargetBlank = values["allow-target-blank"];
			}
			if ("single" in values) {
				// Switch from multi to single mode
				const allowList =
					"allow" in values ? values.allow : (field.config.multi ?? field.config.single);
				delete field.config.multi;
				field.config.single = allowList;
			} else if ("allow" in values) {
				// Update whichever mode is currently set
				if ("single" in field.config) {
					field.config.single = values.allow;
				} else {
					field.config.multi = values.allow;
				}
			}
			break;
		}
		case "Link": {
			if ("allow-target-blank" in values) {
				field.config.allowTargetBlank = values["allow-target-blank"];
			}
			if ("allow-text" in values) field.config.allowText = values["allow-text"];
			if ("repeatable" in values) field.config.repeat = values.repeatable;
			if ("variant" in values) field.config.variants = values.variant;
			if ("tag" in values) field.config.tags = values.tag;
			if ("field" in values) {
				const cts = "custom-type" in values ? values["custom-type"] : field.config.customtypes;
				if (!cts || cts.length === 0) {
					throw new CommandError(
						"--field requires the field to be restricted to a custom type. Use --custom-type to specify one.",
					);
				}
				if (cts.length > 1) {
					throw new CommandError("--field requires the field to be restricted to a single custom type.");
				}
				const ctId = typeof cts[0] === "string" ? cts[0] : cts[0].id;
				const targetType = await getCustomType(ctId, { repo, token, host });
				const resolvedFields = await resolveFieldSelection(values.field!, targetType, { repo, token, host });
				field.config.customtypes = [{ id: ctId, fields: resolvedFields }] as typeof field.config.customtypes;
			} else if ("custom-type" in values) {
				field.config.customtypes = values["custom-type"];
			}
			break;
		}
	}

	await saveModel();

	console.info(`Field updated: ${id}`);
});

function parseNumber(value: string | undefined, optionName: string): number | undefined {
	if (value === undefined) return undefined;
	const number = Number(value);
	if (Number.isNaN(number)) {
		throw new CommandError(`--${optionName} must be a valid number, got "${value}"`);
	}
	return number;
}
