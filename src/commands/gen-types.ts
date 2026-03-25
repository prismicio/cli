import { getAdapter } from "../adapters";
import { generateAndWriteTypes } from "../lib/codegen";
import { createCommand, type CommandConfig } from "../lib/command";
import { relativePathname } from "../lib/url";
import { findProjectRoot } from "../project";

const FILENAME = "prismicio-types.d.ts";

const config = {
	name: "prismic gen types",
	description: `
		Generate TypeScript types from local custom type and slice models.

		Reads models from the customtypes/ and slices directories, then writes
		a prismicio-types.d.ts file at the project root.
	`,
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const adapter = await getAdapter();
	const slices = await adapter.getSlices();
	const customTypes = await adapter.getCustomTypes();
	const projectRoot = await findProjectRoot();

	const output = new URL(FILENAME, projectRoot);
	const relativeOutput = relativePathname(projectRoot, output);

	await generateAndWriteTypes({
		customTypes: customTypes.map((customType) => customType.model),
		slices: slices.map((slice) => slice.model),
		output,
	});

	console.info(`Generated types at ${relativeOutput}`);
});
