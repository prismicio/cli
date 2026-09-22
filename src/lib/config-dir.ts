import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

import { appendTrailingSlash } from "./url";

export function getConfigDir(appName: string, override?: string): URL {
	const dir = (path: string): URL => appendTrailingSlash(pathToFileURL(path));
	const { APPDATA, XDG_CONFIG_HOME } = process.env;

	if (override) return dir(override);
	if (process.platform === "win32" && APPDATA) return new URL(`${appName}/`, dir(APPDATA));
	if (process.platform !== "darwin" && XDG_CONFIG_HOME) {
		return new URL(`${appName}/`, dir(XDG_CONFIG_HOME));
	}
	return new URL(`.config/${appName}/`, dir(homedir()));
}
