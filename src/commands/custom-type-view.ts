import { getHost, getToken } from "../auth";
import { getCustomTypes } from "../clients/custom-types";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { stringify } from "../lib/json";
import { getRepositoryName } from "../project";

const config = {
	name: "prismic custom-type view",
	description: "View details of a custom type.",
	positionals: {
		name: { description: "Name of the custom type", required: true },
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
	const customType = customTypes.find((ct) => ct.label === name);

	if (!customType) {
		throw new CommandError(`Custom type not found: ${name}`);
	}

	if (customType.format === "page") {
		throw new CommandError(
			`"${name}" is not a custom type. Use \`prismic page-type view\` instead.`,
		);
	}

	if (json) {
		console.info(stringify(customType));
		return;
	}

	console.info(`ID: ${customType.id}`);
	console.info(`Name: ${customType.label || "(no name)"}`);
	console.info(`Repeatable: ${customType.repeatable}`);
	const tabs = Object.keys(customType.json).join(", ") || "(none)";
	console.info(`Tabs: ${tabs}`);
});
