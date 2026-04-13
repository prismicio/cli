import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomType, updateCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { NotFoundRequestError, UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic type edit",
	description: "Edit a content type.",
	positionals: {
		id: { description: "ID of the content type", required: true },
	},
	options: {
		name: { type: "string", short: "n", description: "New name for the type" },
		format: { type: "string", short: "f", description: 'Type format: "custom" or "page"' },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { repo = await getRepositoryName() } = values;

	if ("format" in values && values.format !== "custom" && values.format !== "page") {
		throw new CommandError(`Invalid format: "${values.format}". Use "custom" or "page".`);
	}

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

	if ("name" in values) customType.label = values.name;
	if ("format" in values) customType.format = values.format as "custom" | "page";

	try {
		await updateCustomType(customType, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to update type: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.updateCustomType(customType);
	} catch {
		await adapter.createCustomType(customType);
	}
	await adapter.generateTypes();

	console.info(`Type updated: "${customType.label}" (id: ${customType.id})`);
});
