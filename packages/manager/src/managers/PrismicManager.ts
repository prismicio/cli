import { Plugin, PluginSystemRunner } from "@prismicio/plugin-kit";

import { API_ENDPOINTS, APIEndpoints } from "../constants/API_ENDPOINTS";

import { CustomTypesManager } from "./customTypes/CustomTypesManager";
import { PluginsManager } from "./plugins/PluginsManager";
import { PrismicRepositoryManager } from "./prismicRepository/PrismicRepositoryManager";
import { ProjectManager } from "./project/ProjectManager";
import { SlicesManager } from "./slices/SlicesManager";
import { TelemetryManager } from "./telemetry/TelemetryManager";
import { VersionsManager } from "./versions/VersionsManager";

type PrismicManagerConstructorArgs = {
	cwd?: string;
	nativePlugins?: Record<string, Plugin>;
};

export class PrismicManager {
	private _pluginSystemRunner: PluginSystemRunner | undefined = undefined;

	cwd: string;

	customTypes: CustomTypesManager;
	plugins: PluginsManager;
	prismicRepository: PrismicRepositoryManager;
	project: ProjectManager;
	slices: SlicesManager;
	telemetry: TelemetryManager;
	versions: VersionsManager;

	constructor(args?: PrismicManagerConstructorArgs) {
		this.prismicRepository = new PrismicRepositoryManager(this);

		this.plugins = new PluginsManager(this, {
			nativePlugins: args?.nativePlugins,
		});

		this.project = new ProjectManager(this);
		this.customTypes = new CustomTypesManager(this);
		this.slices = new SlicesManager(this);

		this.versions = new VersionsManager(this);

		this.telemetry = new TelemetryManager(this);

		this.cwd = args?.cwd ?? process.cwd();
	}

	// The `_pluginSystemRunner` property is hidden behind a function to
	// discourage access. Using a function deliberately breaks the pattern
	// of other child managers that are accessible as properties, like
	// `project`, `plugins`, etc. We do not treat PluginSystemRunner
	// as a child manager.
	getPluginSystemRunner(): PluginSystemRunner | undefined {
		return this._pluginSystemRunner;
	}

	getAPIEndpoints(): APIEndpoints {
		return API_ENDPOINTS;
	}
}
