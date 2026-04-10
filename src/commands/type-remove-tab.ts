import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, updateCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic type remove-tab",
	description: "Remove a tab from a content type.",
	positionals: {
		name: { description: "Name of the tab", required: true },
	},
	options: {
		from: { type: "string", required: true, description: "ID of the content type" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { from, repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const customTypes = await getCustomTypes({ repo, token, host });
	const type = customTypes.find((ct) => ct.id === from);

	if (!type) {
		throw new CommandError(`Type not found: ${from}`);
	}

	if (!(name in type.json)) {
		throw new CommandError(`Tab "${name}" not found in "${from}".`);
	}

	if (Object.keys(type.json).length <= 1) {
		throw new CommandError(`Cannot remove the last tab from "${from}".`);
	}

	delete type.json[name];

	try {
		await updateCustomType(type, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to remove tab: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.updateCustomType(type);
	} catch {
		await adapter.createCustomType(type);
	}
	await adapter.generateTypes();

	console.info(`Removed tab "${name}" from "${from}"`);
});
