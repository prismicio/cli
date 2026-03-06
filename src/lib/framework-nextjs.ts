import type { Framework } from "./framework-adapter";
import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { exists } from "./file";
import { FrameworkAdapter } from "./framework-adapter";
import {
	exitPreviewRouteTemplate,
	previewRouteTemplate,
	prismicIOFileTemplate,
	revalidateRouteTemplate,
	sliceSimulatorPageTemplate,
	sliceTemplate,
} from "./framework-nextjs.templates";
import { getNpmPackageVersion } from "./packageJson";

export class NextJsFramework extends FrameworkAdapter {
	readonly id: Framework = "next";

	async getDependencies(): Promise<Record<string, string>> {
		return {
			"@prismicio/client": `^${await getNpmPackageVersion("@prismicio/client")}`,
			"@prismicio/react": `^${await getNpmPackageVersion("@prismicio/react")}`,
			"@prismicio/next": `^${await getNpmPackageVersion("@prismicio/next")}`,
		};
	}

	async initProject(): Promise<void> {
		await super.initProject();

		await this.#createPrismicIOFile();
		await this.#createSliceSimulatorPage();
		await this.#createPreviewRoute();
		await this.#createExitPreviewRoute();
		await this.#createRevalidateRoute();
	}

	async createSliceComponent(
		model: SharedSlice,
		sliceDirectory: URL,
	): Promise<{ componentPath: URL }> {
		const extension = await this.getJsFileExtension();
		const componentPath = new URL(`index.${extension}x`, sliceDirectory);
		const contents = sliceTemplate({
			name: model.name,
			typescript: await this.checkIsTypeScriptProject(),
		});
		await writeFile(componentPath, contents);
		return { componentPath };
	}

	getSliceImportPath(relativeDirectory: string): string {
		return `./${relativeDirectory}`;
	}

	async getDefaultSliceLibraryPath(projectRoot: URL): Promise<URL> {
		const srcDirectory = new URL("src/", projectRoot);
		const hasSrcDirectory = await exists(srcDirectory);
		const sourceFilesRoot = hasSrcDirectory ? srcDirectory : projectRoot;
		return new URL("slices/", sourceFilesRoot);
	}

	async getClientFilePath(): Promise<string | null> {
		const hasSrcDirectory = await this.#checkHasSrcDirectory();
		return hasSrcDirectory ? "src/prismicio.ts" : "prismicio.ts";
	}

	async getSlicesDirectoryPath(): Promise<string> {
		const hasSrcDirectory = await this.#checkHasSrcDirectory();
		return hasSrcDirectory ? "src/slices/" : "slices/";
	}

	getSliceComponentExtensions(): string[] {
		return [".tsx", ".ts", ".jsx", ".js"];
	}

	async getRoutePath(
		route: string,
	): Promise<{ path: string; extensions: string[] } | null> {
		const hasSrcDirectory = await this.#checkHasSrcDirectory();
		const base = hasSrcDirectory ? "src/app" : "app";
		switch (route) {
			case "/slice-simulator":
				return { path: `${base}/slice-simulator/page`, extensions: [".tsx", ".ts", ".jsx", ".js"] };
			case "/api/preview":
				return { path: `${base}/api/preview/route`, extensions: [".ts", ".js"] };
			case "/api/exit-preview":
				return { path: `${base}/api/exit-preview/route`, extensions: [".ts", ".js"] };
			case "/api/revalidate":
				return { path: `${base}/api/revalidate/route`, extensions: [".ts", ".js"] };
			default:
				return null;
		}
	}

	async #checkHasAppRouter(): Promise<boolean> {
		const appPath = await this.#buildSrcPath("app");
		return await exists(appPath);
	}

	async #checkHasSrcDirectory(): Promise<boolean> {
		const projectRoot = await this.getProjectRoot();
		return await exists(new URL("src/", projectRoot));
	}

	async #getNextJSVersion(): Promise<string> {
		const projectRoot = await this.getProjectRoot();
		const require = createRequire(new URL("package.json", projectRoot));
		const { version } = require("next/package.json");
		return version;
	}

	async #buildSrcPath(filename: string): Promise<URL> {
		const projectRoot = await this.getProjectRoot();
		const hasSrcDirectory = await this.#checkHasSrcDirectory();
		const prefix = hasSrcDirectory ? "src/" : "";
		return new URL(`${prefix}${filename}`, projectRoot);
	}

	async #createPrismicIOFile(): Promise<void> {
		const extension = await this.getJsFileExtension();
		const filePath = await this.#buildSrcPath(`prismicio.${extension}`);

		if (await exists(filePath)) {
			return;
		}

		const typescript = await this.checkIsTypeScriptProject();
		const appRouter = await this.#checkHasAppRouter();
		const hasSrcDirectory = await this.#checkHasSrcDirectory();

		const contents = prismicIOFileTemplate({
			typescript,
			appRouter,
			hasSrcDirectory,
		});
		await writeFile(filePath, contents);
	}

	async #createSliceSimulatorPage(): Promise<void> {
		const appRouter = await this.#checkHasAppRouter();
		const typescript = await this.checkIsTypeScriptProject();
		const extension = `${await this.getJsFileExtension()}x`;
		const filename = appRouter
			? `app/slice-simulator/page.${extension}`
			: `pages/slice-simulator.${extension}`;
		const filePath = await this.#buildSrcPath(filename);

		if (await exists(filePath)) {
			return;
		}

		const contents = sliceSimulatorPageTemplate({ typescript, appRouter });
		await mkdir(new URL(".", filePath), { recursive: true });
		await writeFile(filePath, contents);
	}

	async #createPreviewRoute(): Promise<void> {
		const appRouter = await this.#checkHasAppRouter();
		const typescript = await this.checkIsTypeScriptProject();
		const extension = await this.getJsFileExtension();
		const filename = appRouter
			? `app/api/preview/route.${extension}`
			: `pages/api/preview.${extension}`;
		const filePath = await this.#buildSrcPath(filename);

		if (await exists(filePath)) {
			return;
		}

		const contents = previewRouteTemplate({ typescript, appRouter });
		await mkdir(new URL(".", filePath), { recursive: true });
		await writeFile(filePath, contents);
	}

	async #createExitPreviewRoute(): Promise<void> {
		const appRouter = await this.#checkHasAppRouter();
		const typescript = await this.checkIsTypeScriptProject();
		const extension = await this.getJsFileExtension();
		const filename = appRouter
			? `app/api/exit-preview/route.${extension}`
			: `pages/api/exit-preview.${extension}`;
		const filePath = await this.#buildSrcPath(filename);

		if (await exists(filePath)) {
			return;
		}

		const contents = exitPreviewRouteTemplate({ typescript, appRouter });
		await mkdir(new URL(".", filePath), { recursive: true });
		await writeFile(filePath, contents);
	}

	async #createRevalidateRoute(): Promise<void> {
		const appRouter = await this.#checkHasAppRouter();
		if (!appRouter) {
			return;
		}

		const extension = await this.getJsFileExtension();
		const filePath = await this.#buildSrcPath(`app/api/revalidate/route.${extension}`);

		if (await exists(filePath)) {
			return;
		}

		const version = await this.#getNextJSVersion();
		const major = Number.parseInt(version.split(".")[0]);
		const supportsCacheLife = major >= 16;

		const contents = revalidateRouteTemplate({ supportsCacheLife });
		await mkdir(new URL(".", filePath), { recursive: true });
		await writeFile(filePath, contents);
	}
}
