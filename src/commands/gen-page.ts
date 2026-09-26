import { getAdapter } from "../adapters";
import { CommandError, createCommand, type CommandConfig } from "../lib/command";
import { relativePathname } from "../lib/url";
import { findProjectRoot } from "../project";

const config = {
	name: "prismic gen page",
	description: `
		Generate the page file for a page type.

		Uses the type's route in prismic.config.json. Existing files are not
		changed: their generated code is printed instead.
	`,
	positionals: {
		"type-id": { description: "ID of the page type", required: true },
	},
	options: {
		force: { type: "boolean", short: "f", description: "Replace existing page files" },
	},
} satisfies CommandConfig;

export default createCommand(config, async ({ positionals, values }) => {
	const [id] = positionals;
	const { force = false } = values;

	const adapter = await getAdapter();
	const { model } = await adapter.getCustomType(id);
	if (model.format !== "page") {
		throw new CommandError(`"${id}" is not a page type.`);
	}

	const skipped = await adapter.writePageFiles(model, { force });
	const shadowingPageNotice = await adapter.getShadowingPageNotice(model);
	if (shadowingPageNotice) console.info(shadowingPageNotice);
	if (skipped.length === 0) {
		console.info(`Generated the page for "${id}".`);
		return;
	}

	const projectRoot = await findProjectRoot();
	for (const file of skipped) {
		const path = relativePathname(projectRoot, file.path);
		console.info(`${path} already exists. Generated code:\n\n${file.contents}`);
		console.info(`Merge this into ${path}, or rerun with --force to replace it.\n`);
	}
});
