import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { resolveCustomType } from "../models";

const config = {
	name: "prismic slice disconnect",
	description: "Disconnect a slice from a type's slice zone.",
	positionals: {
		id: { description: "Slice ID", required: true },
	},
	options: {
		from: {
			type: "string",
			required: true,
			description: "Relative path to the page type or custom type model",
		},
		"slice-zone": {
			type: "string",
			description: 'Slice zone field ID (default: "slices")',
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { from, "slice-zone": sliceZone = "slices" } = values;

	const adapter = await getAdapter();

	const [model, save] = await resolveCustomType(from, { adapter });

	// Find the slice zone field across all tabs.
	type SliceChoices = Record<string, { type: string }>;
	let choices: SliceChoices | undefined;
	for (const tabName of Object.keys(model.json)) {
		const tab = model.json[tabName];
		const field = tab[sliceZone];
		if (field && field.type === "Slices") {
			choices = field.config?.choices as SliceChoices | undefined;
			break;
		}
	}

	if (!choices) {
		throw new CommandError(
			`Slice zone "${sliceZone}" not found in "${from}".`,
		);
	}

	if (!(id in choices)) {
		throw new CommandError(
			`Slice "${id}" is not connected to "${from}" in slice zone "${sliceZone}".`,
		);
	}

	delete choices[id];

	await save();
	await adapter.generateTypes();

	console.info(`Slice disconnected: ${id} -> ${from}`);
});
