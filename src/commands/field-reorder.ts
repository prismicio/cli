import { getFieldReorderTargets, SOURCE_OPTIONS } from "../fields";
import { CommandError, createCommand, exactlyOneOption, type CommandConfig } from "../lib/command";
import { FieldExistsError } from "../lib/prismic/models";

const config = {
	name: "prismic field reorder",
	description: "Reorder a field in a slice or custom type.",
	positionals: {
		id: { description: "Field ID to move", required: true },
	},
	options: {
		before: { type: "string", description: "Place field before this field ID" },
		after: { type: "string", description: "Place field after this field ID" },
		...SOURCE_OPTIONS,
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { key: position, value: anchorPath } = exactlyOneOption(values, ["before", "after"]);

	if (id === anchorPath) {
		throw new CommandError(`Cannot reorder "${id}" relative to itself.`);
	}

	const idContainer = id.split(".").slice(0, -1).join(".");
	const anchorContainer = anchorPath.split(".").slice(0, -1).join(".");
	if (idContainer !== anchorContainer) {
		throw new CommandError(
			`Cannot reorder "${id}" relative to "${anchorPath}": fields must be in the same container.`,
		);
	}

	const { source, anchor, save } = await getFieldReorderTargets(id, anchorPath, values);

	// Top-level fields of a custom type can live in different tabs.
	if (source.fields !== anchor.fields && source.fieldId in anchor.fields) {
		throw new FieldExistsError(source.fieldId);
	}

	const field = source.fields[source.fieldId];
	delete source.fields[source.fieldId];

	// Rebuild the container in place to reorder its keys.
	const entries = Object.entries(anchor.fields);
	for (const [fieldId] of entries) {
		delete anchor.fields[fieldId];
	}
	for (const [fieldId, value] of entries) {
		if (position === "before" && fieldId === anchor.fieldId) {
			anchor.fields[source.fieldId] = field;
		}
		anchor.fields[fieldId] = value;
		if (position === "after" && fieldId === anchor.fieldId) {
			anchor.fields[source.fieldId] = field;
		}
	}

	await save();

	console.info(`Field reordered: ${id}`);
});
