import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomType, updateCustomType } from "../clients/custom-types";
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
	const customType = await getCustomType(from, { repo, token, host });

	if (!(name in customType.json)) {
		throw new CommandError(`Tab "${name}" not found in "${from}".`);
	}

	if (Object.keys(customType.json).length <= 1) {
		throw new CommandError(`Cannot remove the last tab from "${from}".`);
	}

	delete customType.json[name];

	try {
		await updateCustomType(customType, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to remove tab: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.updateCustomType(customType);
	} catch {
		await adapter.createCustomType(customType);
	}
	await adapter.generateTypes();

	console.info(`Removed tab "${name}" from "${from}"`);
});
