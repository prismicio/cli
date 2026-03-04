import { fileURLToPath } from "node:url";

import {
	createPluginSystemRunner,
	type PluginSystemRunner,
} from "@prismicio/plugin-kit";

import { detectAdapterFramework, FRAMEWORK_PLUGINS } from "./framework";

type InitPluginSystemArgs = {
	projectRoot: URL;
	repositoryName: string;
	adapter?: string;
	libraries?: string[];
};

export async function initPluginSystem(
	args: InitPluginSystemArgs,
): Promise<PluginSystemRunner> {
	const root = fileURLToPath(args.projectRoot);
	const framework = await detectAdapterFramework(root);

	const runner = createPluginSystemRunner({
		project: {
			root,
			config: {
				repositoryName: args.repositoryName,
				adapter: args.adapter ?? framework.adapterName,
				libraries: args.libraries,
			},
		},
		nativePlugins: FRAMEWORK_PLUGINS,
	});

	await runner.init();

	return runner;
}
