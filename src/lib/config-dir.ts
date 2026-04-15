import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

import { appendTrailingSlash } from "./url";

export function getConfigDir(appName: string, override?: string): URL {
	if (override) {
		return appendTrailingSlash(pathToFileURL(override));
	}


	if (process.platform === "win32") {
		const appData = process.env.APPDATA;
		if (appData) {
			return new URL(`${appName}/`, appendTrailingSlash(pathToFileURL(appData)));
		}
	}

	if (process.platform !== "darwin") {
		const xdgConfigHome = process.env.XDG_CONFIG_HOME;
		if (xdgConfigHome) {
			return new URL(`${appName}/`, appendTrailingSlash(pathToFileURL(xdgConfigHome)));
		}
	}

	const home = appendTrailingSlash(pathToFileURL(homedir()));

	return new URL(`.config/${appName}/`, home);
}
