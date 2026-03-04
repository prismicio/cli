import type { PrismicManager } from "@prismicio/manager";

import {
	type AdapterFramework as Framework,
	detectAdapterFramework as detectFramework,
	FRAMEWORK_PLUGINS,
} from "../../lib/framework";
import { listrRun } from "../utils/listr";

import type { ProjectContext } from "./project";

export type { Framework };
export { detectFramework, FRAMEWORK_PLUGINS };

type InitFrameworkArgs = {
	manager: PrismicManager;
	projectContext: ProjectContext;
};

export async function initFramework(args: InitFrameworkArgs): Promise<void> {
	const { manager, projectContext } = args;
	const { framework } = projectContext;

	await listrRun([
		{
			title: `Initializing project for ${framework.name}...`,
			task: async (_, parentTask) => {
				const updateOutput = (data: Buffer | string | null) => {
					if (data instanceof Buffer) {
						parentTask.output = data.toString();
					} else if (typeof data === "string") {
						parentTask.output = data;
					}
				};
				await manager.project.initProject({
					log: updateOutput,
				});

				parentTask.title = `Updated project for ${framework.name}`;
			},
		},
	]);
}
