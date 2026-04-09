import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { relativePathname } from "../lib/url";
import { findProjectRoot } from "../project";

const config = {
	name: "prismic gen types",
	description: "Generate TypeScript types for slices and types.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const adapter = await getAdapter();
	const typesPath = await adapter.generateTypes();

	const projectRoot = await findProjectRoot();
	const relativeOutput = relativePathname(projectRoot, typesPath);

	console.info(`Generated types at ${relativeOutput}`);
});
