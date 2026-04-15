import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomType, updateCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic type add-tab",
	description: "Add a tab to a content type.",
	positionals: {
		name: { description: "Name of the tab", required: true },
	},
	options: {
		to: { type: "string", required: true, description: "ID of the content type" },
		"with-slice-zone": { type: "boolean", description: "Add a slice zone to the tab" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { to, "with-slice-zone": withSliceZone, repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const customType = await getCustomType(to, { repo, token, host });

	if (name in customType.json) {
		throw new CommandError(`Tab "${name}" already exists in "${to}".`);
	}

	customType.json[name] = withSliceZone
		? {
				slices: {
					type: "Slices",
					fieldset: "Slice Zone",
					config: { choices: {} },
				},
			}
		: {};

	try {
		await updateCustomType(customType, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to add tab: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.updateCustomType(customType);
	} catch {
		await adapter.createCustomType(customType);
	}
	await adapter.generateTypes();

	console.info(`Added tab "${name}" to "${to}"`);
});
