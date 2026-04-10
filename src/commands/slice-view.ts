import { getHost, getToken } from "../auth";
import { getSlices } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic slice view",
	description: "View details of a slice.",
	positionals: {
		id: { description: "ID of the slice", required: true },
	},
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { json, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const slices = await getSlices({ repo, token, host });
	const slice = slices.find((slice) => slice.id === id);

	if (!slice) {
		throw new CommandError(`Slice not found: ${id}`);
	}

	if (json) {
		console.info(stringify(slice));
		return;
	}

	console.info(`ID: ${slice.id}`);
	console.info(`Name: ${slice.name}`);

	for (const variation of slice.variations ?? []) {
		console.info("");
		console.info(`${variation.id}:`);
		const entries = Object.entries(variation.primary ?? {});
		if (entries.length === 0) {
			console.info("  (no fields)");
		} else {
			for (const [id, field] of entries) {
				const config = field.config as Record<string, unknown> | undefined;
				const label = (config?.label as string) || "";
				const placeholder = config?.placeholder ? `"${config.placeholder}"` : "";
				console.info(`  ${[id, field.type, label, placeholder].filter(Boolean).join("  ")}`);
			}
		}
	}
});
