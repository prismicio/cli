import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, updateCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic type edit",
	description: "Edit a content type.",
	positionals: {
		name: { description: "Name of the content type", required: true },
	},
	options: {
		name: { type: "string", short: "n", description: "New name for the type" },
		format: { type: "string", short: "f", description: 'Type format: "custom" or "page"' },
		repeatable: { type: "boolean", description: "Allow multiple documents of this type" },
		single: { type: "boolean", short: "s", description: "Restrict to a single document" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [currentName] = positionals;
	const { repo = await getRepositoryName() } = values;

	if ("repeatable" in values && "single" in values) {
		throw new CommandError("Cannot use both --repeatable and --single");
	}

	if ("format" in values && values.format !== "custom" && values.format !== "page") {
		throw new CommandError(`Invalid format: "${values.format}". Use "custom" or "page".`);
	}

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const customTypes = await getCustomTypes({ repo, token, host });
	const type = customTypes.find((ct) => ct.label === currentName);

	if (!type) {
		throw new CommandError(`Type not found: ${currentName}`);
	}

	if ("name" in values) type.label = values.name;
	if ("format" in values) type.format = values.format as "custom" | "page";
	if ("repeatable" in values) type.repeatable = true;
	if ("single" in values) type.repeatable = false;

	try {
		await updateCustomType(type, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to update type: ${message}`);
		}
		throw error;
	}

	await adapter.updateCustomType(type);
	await adapter.generateTypes();

	console.info(`Type updated: "${type.label}" (id: ${type.id})`);
});
