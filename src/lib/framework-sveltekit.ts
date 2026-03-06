import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { loadFile } from "magicast";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { exists } from "./file";
import { FrameworkAdapter } from "./framework-adapter";
import {
	previewAPIRouteTemplate,
	prismicIOFileTemplate,
	rootLayoutTemplate,
	sliceSimulatorPageTemplate,
	sliceTemplate,
} from "./framework-sveltekit.templates";
import { getNpmPackageVersion } from "./packageJson";
import { dedent } from "./string";

export class SvelteKitFramework extends FrameworkAdapter {
	async getDependencies(): Promise<Record<string, string>> {
		return {
			"@prismicio/client": `^${await getNpmPackageVersion("@prismicio/client")}`,
			"@prismicio/svelte": `^${await getNpmPackageVersion("@prismicio/svelte")}`,
		};
	}

	async initProject(): Promise<void> {
		await super.initProject();

		await this.#createPrismicIOFile();
		await this.#createSliceSimulatorPage();
		await this.#createPreviewRouteMatcher();
		await this.#createPreviewAPIRoute();
		await this.#createPreviewRouteDirectory();
		await this.#createRootLayoutServerFile();
		await this.#createRootLayoutFile();
		await this.#modifyViteConfig();
	}

	async createSliceComponent(
		model: SharedSlice,
		sliceDirectory: URL,
	): Promise<{ componentPath: URL }> {
		const componentPath = new URL("index.svelte", sliceDirectory);
		const contents = sliceTemplate({
			name: model.name,
			typescript: await this.checkIsTypeScriptProject(),
			version: await this.#getSvelteMajor(),
		});
		await writeFile(componentPath, contents);
		return { componentPath };
	}

	getSliceImportPath(relativeDirectory: string): string {
		return `./${relativeDirectory}/index.svelte`;
	}

	async getDefaultSliceLibraryPath(projectRoot: URL): Promise<URL> {
		return new URL("src/lib/slices/", projectRoot);
	}

	async #createPrismicIOFile(): Promise<void> {
		const extension = await this.getJsFileExtension();
		const projectRoot = await this.getProjectRoot();
		const filePath = new URL(`src/lib/prismicio.${extension}`, projectRoot);

		if (await exists(filePath)) {
			return;
		}

		const typescript = await this.checkIsTypeScriptProject();
		const contents = prismicIOFileTemplate({ typescript });
		await mkdir(new URL(".", filePath), { recursive: true });
		await writeFile(filePath, contents);
	}

	async #createSliceSimulatorPage(): Promise<void> {
		const projectRoot = await this.getProjectRoot();
		const filePath = new URL("src/routes/slice-simulator/+page.svelte", projectRoot);

		if (await exists(filePath)) {
			return;
		}

		const contents = sliceSimulatorPageTemplate({
			version: await this.#getSvelteMajor(),
		});
		await mkdir(new URL(".", filePath), { recursive: true });
		await writeFile(filePath, contents);
	}

	async #createPreviewRouteMatcher(): Promise<void> {
		const extension = await this.getJsFileExtension();
		const projectRoot = await this.getProjectRoot();
		const filePath = new URL(`src/params/preview.${extension}`, projectRoot);

		if (await exists(filePath)) {
			return;
		}

		const contents = dedent`
			export function match(param) {
				return param === 'preview';
			}
		`;
		await mkdir(new URL(".", filePath), { recursive: true });
		await writeFile(filePath, contents);
	}

	async #createPreviewAPIRoute(): Promise<void> {
		const extension = await this.getJsFileExtension();
		const projectRoot = await this.getProjectRoot();
		const filePath = new URL(`src/routes/api/preview/+server.${extension}`, projectRoot);

		if (await exists(filePath)) {
			return;
		}

		const typescript = await this.checkIsTypeScriptProject();
		const contents = previewAPIRouteTemplate({ typescript });
		await mkdir(new URL(".", filePath), { recursive: true });
		await writeFile(filePath, contents);
	}

	async #createPreviewRouteDirectory(): Promise<void> {
		const projectRoot = await this.getProjectRoot();
		const filePath = new URL("src/routes/[[preview=preview]]/README.md", projectRoot);

		if (await exists(filePath)) {
			return;
		}

		const contents = dedent`
			This directory adds support for optional \`/preview\` routes. Do not remove this directory.

			All routes within this directory will be served using the following URLs:

			- \`/example-route\` (prerendered)
			- \`/preview/example-route\` (server-rendered)

			See <https://prismic.io/docs/svelte-preview> for more information.
		`;
		await mkdir(new URL(".", filePath), { recursive: true });
		await writeFile(filePath, contents);
	}

	async #createRootLayoutServerFile(): Promise<void> {
		const extension = await this.getJsFileExtension();
		const projectRoot = await this.getProjectRoot();
		const filePath = new URL(`src/routes/+layout.server.${extension}`, projectRoot);

		if (await exists(filePath)) {
			return;
		}

		const contents = dedent`
			export const prerender = "auto";
		`;
		await mkdir(new URL(".", filePath), { recursive: true });
		await writeFile(filePath, contents);
	}

	async #createRootLayoutFile(): Promise<void> {
		const projectRoot = await this.getProjectRoot();
		const filePath = new URL("src/routes/+layout.svelte", projectRoot);

		if (await exists(filePath)) {
			return;
		}

		const contents = rootLayoutTemplate({
			version: await this.#getSvelteMajor(),
		});
		await mkdir(new URL(".", filePath), { recursive: true });
		await writeFile(filePath, contents);
	}

	async #modifyViteConfig(): Promise<void> {
		const projectRoot = await this.getProjectRoot();
		let configUrl = new URL("vite.config.js", projectRoot);
		if (!(await exists(configUrl))) {
			configUrl = new URL("vite.config.ts", projectRoot);
		}
		if (!(await exists(configUrl))) {
			return;
		}

		const filepath = configUrl.pathname;
		const mod = await loadFile(filepath);
		if (mod.exports.default.$type !== "function-call") {
			return;
		}

		const config = mod.exports.default.$args[0];
		config.server ??= {};
		config.server.fs ??= {};
		config.server.fs.allow ??= [];
		if (!config.server.fs.allow.includes("./prismic.config.json")) {
			config.server.fs.allow.push("./prismic.config.json");
		}

		const contents = mod.generate().code.replace(/\n\s*\n(?=\s*server:)/, "\n");
		await writeFile(configUrl, contents);
	}

	async #getSvelteMajor(): Promise<number> {
		const projectRoot = await this.getProjectRoot();
		const require = createRequire(new URL("package.json", projectRoot));
		const { version } = require("svelte/package.json");
		const major = Number.parseInt(version.split(".")[0]);
		if (Number.isNaN(major)) return Infinity;
		return major;
	}
}
