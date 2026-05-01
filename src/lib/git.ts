import { fileURLToPath, pathToFileURL } from "node:url";
import { x } from "tinyexec";

import { appendTrailingSlash } from "./url";

export async function getGitRoot(start: URL): Promise<URL | undefined> {
	try {
		const { stdout } = await x("git", ["rev-parse", "--show-toplevel"], {
			nodeOptions: { cwd: fileURLToPath(start) },
			throwOnError: true,
		});
		const top = stdout.trim();
		return top ? appendTrailingSlash(pathToFileURL(top)) : undefined;
	} catch {
		return undefined;
	}
}

export async function getDirtyTrackedPaths(gitRoot: URL): Promise<URL[]> {
	try {
		const { stdout } = await x("git", ["status", "--porcelain", "--untracked-files=no"], {
			nodeOptions: { cwd: fileURLToPath(gitRoot) },
			throwOnError: true,
		});
		const paths: URL[] = [];
		for (const line of stdout.split("\n")) {
			if (line.length < 4) continue;
			let path = line.slice(3);
			const arrow = path.indexOf(" -> ");
			if (arrow !== -1) path = path.slice(arrow + 4);
			paths.push(new URL(path, gitRoot));
		}
		return paths;
	} catch {
		return [];
	}
}
