import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { kebabCase } from "change-case";
import type { types } from "recast";
import * as recast from "recast";
import * as typescriptParser from "recast/parsers/typescript.js";

import type { Framework } from ".";

import { FrameworkAdapter } from ".";
import { exists, writeFileRecursive } from "../lib/file";
import { getNpmPackageVersion } from "../lib/packageJson";
import {
	exitPreviewRouteTemplate,
	previewRouteTemplate,
	prismicIOFileTemplate,
	revalidateRouteTemplate,
	sliceSimulatorPageTemplate,
	sliceTemplate,
} from "./nextjs.templates";

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
		await writeFileRecursive(componentPath, contents);
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

	async getRoutePath(route: string): Promise<{ path: string; extensions: string[] } | null> {
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

	async updateRoutesForPageTypes(customTypes: CustomType[]): Promise<void> {
		const pageTypes = customTypes
			.filter((ct) => ct.format === "page")
			.sort((a, b) => a.id.localeCompare(b.id));

		if (pageTypes.length === 0) {
			return;
		}

		const extension = await this.getJsFileExtension();
		const filePath = await this.#buildSrcPath(`prismicio.${extension}`);

		if (!(await exists(filePath))) {
			return;
		}

		const contents = await readFile(filePath, "utf8");

		let ast: types.ASTNode;
		try {
			ast = recast.parse(contents, { parser: typescriptParser });
		} catch {
			return;
		}

		const routesArray = this.#findRoutesArray(ast);
		if (!routesArray) {
			return;
		}

		const existingTypes = new Set(
			routesArray.elements.map((el) => this.#getRouteType(el)).filter(Boolean),
		);

		const missingTypes = pageTypes.filter((m) => !existingTypes.has(m.id));
		if (missingTypes.length === 0) {
			return;
		}

		for (const model of missingTypes) {
			const routePath = this.#buildRoutePath(model.id, model.repeatable);
			const routeObj = this.#createRouteObject(model.id, routePath);
			routesArray.elements.push(routeObj);
		}

		const updated = recast.print(ast).code;
		if (updated !== contents) {
			await writeFileRecursive(filePath, updated);
		}
	}

	async removeRoutesForPageType(customTypeId: string): Promise<void> {
		const extension = await this.getJsFileExtension();
		const filePath = await this.#buildSrcPath(`prismicio.${extension}`);

		if (!(await exists(filePath))) {
			return;
		}

		const contents = await readFile(filePath, "utf8");

		let ast: types.ASTNode;
		try {
			ast = recast.parse(contents, { parser: typescriptParser });
		} catch {
			return;
		}

		const routesArray = this.#findRoutesArray(ast);
		if (!routesArray) {
			return;
		}

		// Find ALL elements with matching type (a type can have multiple route configs)
		const indicesToRemove = routesArray.elements
			.map((el, i) => (this.#getRouteType(el) === customTypeId ? i : -1))
			.filter((i) => i !== -1);

		if (indicesToRemove.length === 0) {
			return;
		}

		// Process in reverse order to avoid index shifting issues
		for (let i = indicesToRemove.length - 1; i >= 0; i--) {
			const indexToRemove = indicesToRemove[i];
			const elementToRemove = routesArray.elements[indexToRemove];

			// Preserve leading comments by attaching them to the next non-deleted element
			const comments = this.#getNodeComments(elementToRemove);
			const leadingComments = comments.filter((c) => c.leading);

			if (leadingComments.length > 0) {
				const nextIndex = routesArray.elements.findIndex(
					(_, idx) => idx > indexToRemove && !indicesToRemove.includes(idx),
				);

				const nextElement = nextIndex !== -1 ? routesArray.elements[nextIndex] : null;

				if (nextElement) {
					const existingComments = this.#getNodeComments(nextElement);
					this.#setNodeComments(nextElement, [...leadingComments, ...existingComments]);
				}
			}

			routesArray.elements.splice(indexToRemove, 1);
		}

		const updated = recast.print(ast).code;
		if (updated !== contents) {
			await writeFileRecursive(filePath, updated);
		}
	}

	#getNodeComments(node: unknown): { leading: boolean; value: string }[] {
		if (
			typeof node === "object" &&
			node !== null &&
			"comments" in node &&
			Array.isArray(node.comments)
		) {
			return node.comments;
		}
		return [];
	}

	#setNodeComments(node: unknown, comments: { leading: boolean; value: string }[]): void {
		if (typeof node === "object" && node !== null) {
			Object.assign(node, { comments });
		}
	}

	#findRoutesArray(ast: types.ASTNode): types.namedTypes.ArrayExpression | undefined {
		const n = recast.types.namedTypes;
		let routesArray: types.namedTypes.ArrayExpression | undefined;

		recast.visit(ast, {
			visitVariableDeclarator(nodePath): false | void {
				const node = nodePath.node;
				if (
					n.Identifier.check(node.id) &&
					node.id.name === "routes" &&
					n.ArrayExpression.check(node.init)
				) {
					routesArray = node.init;
					return false;
				}
				this.traverse(nodePath);
			},
		});

		return routesArray;
	}

	#getRouteType(element: unknown): string | undefined {
		const n = recast.types.namedTypes;

		if (!n.ObjectExpression.check(element)) {
			return;
		}

		for (const prop of element.properties) {
			if (!n.Property.check(prop) && !n.ObjectProperty?.check?.(prop)) {
				continue;
			}

			const keyName = n.Identifier.check(prop.key)
				? prop.key.name
				: n.StringLiteral.check(prop.key)
					? prop.key.value
					: n.Literal.check(prop.key) && typeof prop.key.value === "string"
						? prop.key.value
						: undefined;

			if (keyName === "type") {
				const val = prop.value;
				if (n.StringLiteral.check(val)) {
					return val.value;
				}
				if (n.Literal.check(val) && typeof val.value === "string") {
					return val.value;
				}
			}
		}
	}

	#createRouteObject(typeId: string, routePath: string): types.namedTypes.ObjectExpression {
		const b = recast.types.builders;
		return b.objectExpression([
			b.property("init", b.identifier("type"), b.stringLiteral(typeId)),
			b.property("init", b.identifier("path"), b.stringLiteral(routePath)),
		]);
	}

	#buildRoutePath(typeId: string, repeatable?: boolean): string {
		const segment = kebabCase(typeId);
		return `/${segment}${repeatable ? "/:uid" : ""}`;
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
		await writeFileRecursive(filePath, contents);
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
		await writeFileRecursive(filePath, contents);
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
		await writeFileRecursive(filePath, contents);
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
		await writeFileRecursive(filePath, contents);
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
		await writeFileRecursive(filePath, contents);
	}
}
