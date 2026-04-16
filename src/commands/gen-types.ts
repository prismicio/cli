import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { flushActions, formatAction } from "../lib/logger";
import { findProjectRoot } from "../project";

const config = {
	name: "prismic gen types",
	description: "Generate TypeScript types for slices and content types.",
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const adapter = await getAdapter();
	await adapter.generateTypes();

	const projectRoot = await findProjectRoot();
	for (const action of flushActions()) {
		console.info(formatAction(action, projectRoot));
	}
});
