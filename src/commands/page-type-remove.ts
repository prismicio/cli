import { getHost, getToken } from "../auth";
import { getCustomTypes, removeCustomType } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { UnknownRequestError } from "../lib/request";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic page-type remove",
	description: "Remove a page type.",
	positionals: {
		name: { description: "Name of the page type", required: true },
	},
	options: {
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const customTypes = await getCustomTypes({ repo, token, host });
	const pageType = customTypes.find((ct) => ct.label === name);

	if (!pageType) {
		throw new CommandError(`Page type not found: ${name}`);
	}

	if (pageType.format !== "page") {
		throw new CommandError(
			`"${name}" is not a page type. Use \`prismic custom-type remove\` instead.`,
		);
	}

	try {
		await removeCustomType(pageType.id, { repo, host, token });
	} catch (error) {
		if (error instanceof UnknownRequestError) {
			const message = await error.text();
			throw new CommandError(`Failed to create page type: ${message}`);
		}
		throw error;
	}

	console.info(`Page type removed: "${name}" (id: ${pageType.id})`);
});
