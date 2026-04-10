import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, updateCustomType } from "../clients/custom-types";
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
		to: { type: "string", required: true, description: "Name of the content type" },
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
	const customTypes = await getCustomTypes({ repo, token, host });
	const type = customTypes.find((ct) => ct.label === to);

	if (!type) {
		throw new CommandError(`Type not found: ${to}`);
	}

	if (name in type.json) {
		throw new CommandError(`Tab "${name}" already exists in "${to}".`);
	}

	type.json[name] = withSliceZone
		? {
				slices: {
					type: "Slices",
					fieldset: "Slice Zone",
					config: { choices: {} },
				},
			}
		: {};

	try {
		await updateCustomType(type, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to add tab: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.updateCustomType(type);
	} catch {
		await adapter.createCustomType(type);
	}
	await adapter.generateTypes();

	console.info(`Added tab "${name}" to "${to}"`);
});
