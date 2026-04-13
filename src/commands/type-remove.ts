import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomType, removeCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { NotFoundRequestError, UnknownRequestError } from "../lib/request";
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
	let customType;
	try {
		customType = await getCustomType(id, { repo, token, host });
	} catch (error) {
		if (error instanceof NotFoundRequestError) throw new CommandError(`Type not found: ${id}`);
		throw error;
	}

	try {
		await removeCustomType(customType.id, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to remove type: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.deleteCustomType(customType.id);
	} catch {}
	await adapter.generateTypes();

	console.info(`Type removed: ${id}`);
});
