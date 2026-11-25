import type { GroupModel } from "@prismicio/types-internal";
import { capitalCase } from "change-case";

import { getNewFieldTarget, TARGET_OPTIONS } from "../fields";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { addField } from "../lib/prismic/models";

const config = {
	name: "prismic field add group",
	description: `
		Add a group field to a slice or custom type.

		To add fields inside the group, use dot notation for their IDs:

		  prismic field add text my_group.description --to-slice hero

		Run \`prismic docs view fields/repeatable-group\` for details.
	`,
	positionals: {
		id: { description: "Field ID", required: true },
	},
	options: {
		...TARGET_OPTIONS,
		label: { type: "string", description: "Field label" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { label } = values;

	if (values["legacy-items-zone"]) {
		throw new CommandError("Group fields cannot be added to the legacy items zone.");
	}

	const { fields, fieldId, save } = await getNewFieldTarget(id, values);

	const field: GroupModel = {
		type: "Group",
		config: {
			label: label ?? capitalCase(fieldId),
		},
	};

	addField(fields, fieldId, field);
	await save();

	const target = [
		values["to-slice"] && `--to-slice ${values["to-slice"]}`,
		values.variation && `--variation ${values.variation}`,
		values["to-type"] && `--to-type ${values["to-type"]}`,
		values.tab && `--tab ${JSON.stringify(values.tab)}`,
	]
		.filter(Boolean)
		.join(" ");

	console.info(`Field added: ${id}`);
	console.info(
		`Run \`prismic field add <type> ${id}.<field_id> ${target}\` to add fields inside the group.`,
	);
});
