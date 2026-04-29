import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveFieldPair, resolveFieldTarget } from "../models";

const config = {
	name: "prismic field reorder",
	description: "Reorder a field in a slice or custom type.",
	positionals: {
		id: { description: "Field ID to move", required: true },
	},
	options: {
		before: { type: "string", description: "Place field before this field ID" },
		after: { type: "string", description: "Place field after this field ID" },
		"from-slice": { type: "string", description: "ID of the source slice" },
		"from-type": { type: "string", description: "ID of the source content type" },
		variation: { type: "string", description: 'Slice variation ID (default: "default")' },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { before, after } = values;

	if (!before && !after) {
		throw new CommandError("Specify --before or --after.");
	}
	if (before && after) {
		throw new CommandError("Only one of --before or --after can be specified.");
	}

	const anchor = (before ?? after)!;
	const position = before ? "before" : "after";

	if (id === anchor) {
		throw new CommandError(`Cannot reorder "${id}" relative to itself.`);
	}

	const idParent = id.lastIndexOf(".");
	const anchorParent = anchor.lastIndexOf(".");
	if (
		(idParent === -1 ? "" : id.slice(0, idParent)) !==
		(anchorParent === -1 ? "" : anchor.slice(0, anchorParent))
	) {
		throw new CommandError(
			`Cannot reorder "${id}" relative to "${anchor}": fields must be in the same container.`,
		);
	}

	const [sourceFields, anchorFields, saveModel] = await resolveFieldPair(id, anchor, values);

	const [sourceLeaf, sourceFieldId] = resolveFieldTarget(sourceFields, id);
	const [anchorLeaf, anchorFieldId] = resolveFieldTarget(anchorFields, anchor);

	if (!(sourceFieldId in sourceLeaf)) {
		throw new CommandError(`Field "${id}" does not exist.`);
	}
	if (!(anchorFieldId in anchorLeaf)) {
		throw new CommandError(`Field "${anchor}" does not exist.`);
	}

	const fieldValue = sourceLeaf[sourceFieldId];
	delete sourceLeaf[sourceFieldId];

	const entries = Object.entries(anchorLeaf);
	for (const key of Object.keys(anchorLeaf)) {
		delete anchorLeaf[key];
	}
	for (const [key, value] of entries) {
		if (position === "before" && key === anchorFieldId) {
			anchorLeaf[sourceFieldId] = fieldValue;
		}
		anchorLeaf[key] = value;
		if (position === "after" && key === anchorFieldId) {
			anchorLeaf[sourceFieldId] = fieldValue;
		}
	}

	await saveModel();

	console.info(`Field reordered: ${id}`);
});
