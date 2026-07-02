import { getAdapter } from "../adapters";
import { createCommand, type CommandConfig } from "../lib/command";
import { removeEnvVar } from "../lib/env-file";
import { findProjectRoot } from "../project";

const config = {
	name: "prismic env unset",
	description: `
		Revert to production by removing the active environment from .env.local.
	`,
} satisfies CommandConfig;

export default createCommand(config, async () => {
	const adapter = await getAdapter();
	const projectRoot = await findProjectRoot();
	await removeEnvVar(new URL(".env.local", projectRoot), adapter.repositoryEnvVar);
	console.info("Active environment reverted to production.");
});
