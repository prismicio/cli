import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Environments } from "../../environments";

import { ENVIRONMENTS_PATH } from "../../config";
import { appendTrailingSlash } from "../../lib/url";

const environment = getEnvironment();
if (environment) {
	process.env.NEXT_PUBLIC_PRISMIC_ENVIRONMENT ??= environment;
	process.env.PUBLIC_PRISMIC_ENVIRONMENT ??= environment;
	process.env.NUXT_PUBLIC_PRISMIC_ENVIRONMENT ??= environment;
}

// Reads the active environment synchronously so this module can run without
// top-level `await`. Bundlers that load config files (e.g. Next.js loading
// `next.config.ts`) don't support top-level `await` and fail otherwise.
function getEnvironment(): string | undefined {
	const projectRoot = findProjectRoot();
	if (!projectRoot) return;
	try {
		const contents = readFileSync(ENVIRONMENTS_PATH, "utf-8");
		const environments: Environments = JSON.parse(contents);
		return environments[projectRoot.toString()];
	} catch {
		return;
	}
}

function findProjectRoot(): URL | undefined {
	let dir = appendTrailingSlash(pathToFileURL(process.cwd()));
	while (true) {
		if (
			existsSync(new URL("prismic.config.json", dir)) ||
			existsSync(new URL("package.json", dir))
		) {
			return appendTrailingSlash(pathToFileURL(realpathSync(fileURLToPath(dir))));
		}
		const parent = new URL("..", dir);
		if (parent.href === dir.href) return;
		dir = parent;
	}
}
