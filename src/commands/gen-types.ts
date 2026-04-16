import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { flushLogs, formatChanges } from "../lib/logger";
import { findProjectRoot } from "../project";

const config = {
	name: "prismic gen types",
	description: "Generate TypeScript types for slices and content types.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const adapter = await getAdapter();
	await adapter.generateTypes();

	const projectRoot = await findProjectRoot();
	console.info(formatChanges(flushLogs(), { title: "Generated types", root: projectRoot }));
});
