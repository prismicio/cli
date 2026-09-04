import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { readConfig } from "../project";

const config = {
	name: "prismic type edit",
	description: "Edit a content type.",
	positionals: {
		id: { description: "ID of the content type", required: true },
	},
	options: {
		name: { type: "string", short: "n", description: "New name for the type" },
		format: {
			type: "string",
			short: "f",
			description:
				'Type format: "custom" or "page". "page" adds a default route to prismic.config.json, "custom" removes it',
		},
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;

	if ("format" in values && values.format !== "custom" && values.format !== "page") {
		throw new CommandError(`Invalid format: "${values.format}". Use "custom" or "page".`);
	}

	const adapter = await getAdapter();
	const { model: customType } = await adapter.getCustomType(id);

	if ("name" in values) customType.label = values.name;
	if ("format" in values) customType.format = values.format as "custom" | "page";

	await adapter.updateCustomType(customType);
	await adapter.generateTypes();

	console.info(`Type updated: "${customType.label}" (id: ${customType.id})`);
	if ("format" in values) {
		const { routes = [] } = await readConfig();
		const route = routes.find((route) => route.type === customType.id);
		if (route) {
			console.info(
				`Route: ${route.path} in prismic.config.json. Edit prismic.config.json to change it.`,
			);
		} else {
			console.info(`Removed the route for ${customType.id} from prismic.config.json.`);
		}
	}
});
