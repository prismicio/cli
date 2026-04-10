import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, removeCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic type remove",
	description: "Remove a content type.",
	positionals: {
		id: { description: "ID of the content type", required: true },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const customTypes = await getCustomTypes({ repo, token, host });
	const type = customTypes.find((ct) => ct.id === id);

	if (!type) {
		throw new CommandError(`Type not found: ${id}`);
	}

	try {
		await removeCustomType(type.id, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to remove type: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.deleteCustomType(type.id);
	} catch {}
	await adapter.generateTypes();

	console.info(`Type removed: ${id}`);
});
