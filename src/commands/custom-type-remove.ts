import { getAdapter } from "../adapters";
import { getHost, getToken } from "../auth";
import { getCustomTypes, removeCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic custom-type remove",
	description: "Remove a custom type.",
	positionals: {
		name: { description: "Name of the custom type", required: true },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { repo = await getRepositoryName() } = values;

	const adapter = await getAdapter();
	const token = await getToken();
	const host = await getHost();
	const customTypes = await getCustomTypes({ repo, token, host });
	const customType = customTypes.find((ct) => ct.label === name);

	if (!customType) {
		throw new CommandError(`Custom type not found: ${name}`);
	}

	if (customType.format === "page") {
		throw new CommandError(
			`"${name}" is not a custom type. Use \`prismic page-type remove\` instead.`,
		);
	}

	try {
		await removeCustomType(customType.id, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to remove custom type: ${message}`);
		}
		throw error;
	}

	try {
		await adapter.deleteCustomType(customType.id);
	} catch {}
	await adapter.generateTypes();

	console.info(`Custom type removed: "${name}" (id: ${customType.id})`);
});
