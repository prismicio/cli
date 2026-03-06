import { readFile } from "node:fs/promises";

import * as v from "valibot";

import { exists, findUpward } from "./file";

export type Framework = "next" | "nuxt" | "sveltekit";

export type FrameworkInfo = {
	framework: Framework | undefined;
	hasSrcDir: boolean;
	projectRoot: URL;
};

const PackageJsonSchema = v.object({
	dependencies: v.optional(v.record(v.string(), v.string())),
	devDependencies: v.optional(v.record(v.string(), v.string())),
});

export async function detectFrameworkInfo(): Promise<FrameworkInfo | undefined> {
	const packageJsonPath = await findUpward("package.json");
	if (!packageJsonPath) return undefined;

	const projectRoot = new URL(".", packageJsonPath);

	let framework: Framework | undefined;
	try {
		const contents = await readFile(packageJsonPath, "utf8");
		const { dependencies = {}, devDependencies = {} } = v.parse(
			PackageJsonSchema,
			JSON.parse(contents),
		);
		const allDeps = { ...dependencies, ...devDependencies };
		if ("next" in allDeps) framework = "next";
		else if ("nuxt" in allDeps) framework = "nuxt";
		else if ("@sveltejs/kit" in allDeps) framework = "sveltekit";
	} catch {
		// Continue with undefined framework
	}

	let hasSrcDir = false;
	if (framework === "next" || framework === "sveltekit") {
		hasSrcDir = await exists(new URL("src/", projectRoot));
	} else if (framework === "nuxt") {
		hasSrcDir = await exists(new URL("app/", projectRoot));
	}

	return { framework, hasSrcDir, projectRoot };
}

export function getRequiredDependencies(framework: Framework | undefined): string[] {
	switch (framework) {
		case "next":
			return ["@prismicio/client", "@prismicio/react", "@prismicio/next"];
		case "nuxt":
			return ["@nuxtjs/prismic"];
		case "sveltekit":
			return ["@prismicio/client", "@prismicio/svelte"];
		default:
			return ["@prismicio/client"];
	}
}

export function getClientFilePath(info: FrameworkInfo): string | null {
	switch (info.framework) {
		case "next":
			return info.hasSrcDir ? "src/prismicio.ts" : "prismicio.ts";
		case "nuxt":
			return null; // Nuxt uses nuxt.config.ts instead
		case "sveltekit":
			return "src/lib/prismicio.ts";
		default:
			return "prismicio.ts";
	}
}

export function getSlicesDirectory(info: FrameworkInfo): string {
	switch (info.framework) {
		case "next":
			return info.hasSrcDir ? "src/slices/" : "slices/";
		case "nuxt":
			return info.hasSrcDir ? "app/slices/" : "slices/";
		case "sveltekit":
			return "src/lib/slices/";
		default:
			return "slices/";
	}
}

export function getSliceComponentExtensions(framework: Framework | undefined): string[] {
	switch (framework) {
		case "next":
			return [".tsx", ".ts", ".jsx", ".js"];
		case "nuxt":
			return [".vue"];
		case "sveltekit":
			return [".svelte"];
		default:
			return [".tsx", ".ts", ".jsx", ".js"];
	}
}

export function getRoutePath(
	info: FrameworkInfo,
	route: string,
): { path: string; extensions: string[] } | null {
	switch (info.framework) {
		case "next": {
			const base = info.hasSrcDir ? "src/app" : "app";
			if (route === "/slice-simulator") {
				return { path: `${base}/slice-simulator/page`, extensions: [".tsx", ".ts", ".jsx", ".js"] };
			}
			if (route === "/api/preview") {
				return { path: `${base}/api/preview/route`, extensions: [".ts", ".js"] };
			}
			if (route === "/api/exit-preview") {
				return { path: `${base}/api/exit-preview/route`, extensions: [".ts", ".js"] };
			}
			if (route === "/api/revalidate") {
				return { path: `${base}/api/revalidate/route`, extensions: [".ts", ".js"] };
			}
			return null;
		}
		case "nuxt": {
			if (route === "/slice-simulator") {
				return { path: "pages/slice-simulator", extensions: [".vue"] };
			}
			// Preview endpoints are built-in for Nuxt
			return null;
		}
		case "sveltekit": {
			if (route === "/slice-simulator") {
				return { path: "src/routes/slice-simulator/+page", extensions: [".svelte"] };
			}
			if (route === "/api/preview") {
				return { path: "src/routes/api/preview/+server", extensions: [".ts", ".js"] };
			}
			// exit-preview not required for SvelteKit
			return null;
		}
		default:
			return null;
	}
}
