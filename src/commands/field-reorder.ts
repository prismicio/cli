import { getFieldReorderTargets, SOURCE_OPTIONS } from "../fields";
import {
	CommandError,
	createCommand,
	exactlyOneOption,
	type CommandConfig,
} from "../lib/command";
import { reorderField } from "../lib/prismic/models";

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
	const { key: position, value: anchor } = exactlyOneOption(values, ["before", "after"]);

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

	const { source, anchor: resolvedAnchor, save } = await getFieldReorderTargets(id, anchor, values);
	reorderField(
		source.fields,
		source.fieldId,
		resolvedAnchor.fields,
		resolvedAnchor.fieldId,
		position,
	);
	await save();

	console.info(`Field reordered: ${id}`);
});
