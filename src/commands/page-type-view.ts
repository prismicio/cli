import { getHost, getToken } from "../auth";
import { getCustomTypes } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic page-type view",
	description: "View details of a page type.",
	positionals: {
		name: { description: "Name of the page type", required: true },
	},
	options: {
		json: { type: "boolean", description: "Output as JSON" },
		repo: { type: "string", short: "r", description: "Repository domain" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [name] = positionals;
	const { json, repo = await getRepositoryName() } = values;

	const token = await getToken();
	const host = await getHost();
	const customTypes = await getCustomTypes({ repo, token, host });
	const pageType = customTypes.find((ct) => ct.label === name);

	if (!pageType) {
		throw new CommandError(`Page type not found: ${name}`);
	}

	if (pageType.format !== "page") {
		throw new CommandError(
			`"${name}" is not a page type. Use \`prismic custom-type view\` instead.`,
		);
	}

	if (json) {
		console.info(stringify(pageType));
		return;
	}

	console.info(`ID: ${pageType.id}`);
	console.info(`Name: ${pageType.label || "(no name)"}`);
	console.info(`Repeatable: ${pageType.repeatable}`);
	const tabs = Object.keys(pageType.json).join(", ") || "(none)";
	console.info(`Tabs: ${tabs}`);
});
