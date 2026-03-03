import * as path from "node:path";

import type { PluginSystemContext } from "@prismicio/plugin-kit";
import {
	checkHasProjectFile,
	readProjectFile,
	writeProjectFile,
} from "@prismicio/plugin-kit/fs";
import { kebabCase } from "change-case";
import type { types } from "recast";
import * as recast from "recast";
import * as typescriptParser from "recast/parsers/typescript.js";

import type { PluginOptions } from "../types";

import { buildSrcPath } from "./buildSrcPath";
import { checkHasAppRouter } from "./checkHasAppRouter";
import { checkIsTypeScriptProject } from "./checkIsTypeScriptProject";
import { getJSFileExtension } from "./getJSFileExtension";
import { generatePageComponent } from "./pageTypeTemplates";

export type PageTypeModel = {
	id: string;
	repeatable?: boolean;
	format?: string;
};

export const isPageType = (model: { format?: string } | undefined): boolean => {
	return model?.format === "page";
};

/**
 * Comment type attached to AST nodes by recast.
 */
type ASTComment = { leading?: boolean; trailing?: boolean };

/**
 * Safely extracts comments from an AST node.
 * Recast attaches comments to nodes but doesn't include them in the type definitions.
 */
const getNodeComments = (node: unknown): ASTComment[] => {
	if (
		typeof node === "object" &&
		node !== null &&
		"comments" in node &&
		Array.isArray(node.comments)
	) {
		return node.comments;
	}

	return [];
};

/**
 * Safely sets comments on an AST node.
 * Uses Object.assign to avoid direct property assignment casting.
 */
const setNodeComments = (node: unknown, comments: ASTComment[]): void => {
	if (typeof node === "object" && node !== null) {
		Object.assign(node, { comments });
	}
};

/**
 * Type guard to check if a value is a custom type descriptor with a model.
 */
const isCustomTypeDescriptor = (
	value: unknown,
): value is { model: PageTypeModel } => {
	if (typeof value !== "object" || value === null || !("model" in value)) {
		return false;
	}

	const { model } = value;

	return (
		typeof model === "object" &&
		model !== null &&
		"id" in model &&
		typeof model.id === "string"
	);
};

const buildRoutePath = (typeId: string, repeatable?: boolean): string => {
	const segment = kebabCase(typeId);

	return `/${segment}${repeatable ? "/:uid" : ""}`;
};

type PrismicioFile = {
	filename: string;
	contents: string;
	ast: types.ASTNode;
};

/**
 * Reads and parses the prismicio file, returning the AST and metadata.
 */
const readPrismicioFile = async (
	context: PluginSystemContext<PluginOptions>,
): Promise<PrismicioFile | undefined> => {
	const ext = await getJSFileExtension({
		helpers: context.helpers,
		options: context.options,
		jsx: false,
	});

	const filename = await buildSrcPath({
		filename: `prismicio.${ext}`,
		helpers: context.helpers,
	});

	if (!(await checkHasProjectFile({ filename, helpers: context.helpers }))) {
		return;
	}

	const contents = await readProjectFile({
		filename,
		helpers: context.helpers,
		encoding: "utf8",
	});

	if (typeof contents !== "string") {
		return;
	}

	try {
		// Use TypeScript parser to handle both .ts and .js files
		const ast = recast.parse(contents, {
			parser: typescriptParser,
		});

		return { filename, contents, ast };
	} catch {
		// If parsing fails, the file might have syntax errors
		return;
	}
};

/**
 * Finds the `routes` array declaration in the AST.
 */
export const findRoutesArray = (
	ast: types.ASTNode,
): types.namedTypes.ArrayExpression | undefined => {
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

				return false; // Stop traversal
			}

			this.traverse(nodePath);
		},
	});

	return routesArray;
};

/**
 * Extracts a string value from an AST node.
 * Handles Identifier (returns name), StringLiteral, and Literal nodes.
 */
const getStringFromNode = (node: unknown): string | undefined => {
	const n = recast.types.namedTypes;

	if (n.Identifier.check(node)) {
		return node.name;
	}

	if (n.StringLiteral.check(node)) {
		return node.value;
	}

	if (n.Literal.check(node) && typeof node.value === "string") {
		return node.value;
	}
};

/**
 * Extracts key and value from a property node (handles both Property and ObjectProperty).
 */
const getPropertyKeyValue = (
	prop: unknown,
): { key: unknown; value: unknown } | undefined => {
	const n = recast.types.namedTypes;

	if (n.Property.check(prop)) {
		return { key: prop.key, value: prop.value };
	}

	if (n.ObjectProperty?.check?.(prop)) {
		return { key: prop.key, value: prop.value };
	}
};

/**
 * Extracts the `type` value from a route object element.
 */
export const getRouteType = (element: unknown): string | undefined => {
	const n = recast.types.namedTypes;

	if (!n.ObjectExpression.check(element)) {
		return;
	}

	for (const prop of element.properties) {
		const kv = getPropertyKeyValue(prop);
		if (!kv) {
			continue;
		}

		const keyName = getStringFromNode(kv.key);

		if (keyName === "type") {
			return getStringFromNode(kv.value);
		}
	}
};

/**
 * Creates a route object AST node.
 */
const createRouteObject = (
	typeId: string,
	routePath: string,
): types.namedTypes.ObjectExpression => {
	const b = recast.types.builders;

	return b.objectExpression([
		b.property("init", b.identifier("type"), b.stringLiteral(typeId)),
		b.property("init", b.identifier("path"), b.stringLiteral(routePath)),
	]);
};

/**
 * Adds missing page type routes to `prismicio.ts`.
 *
 * Only appends new entries; does not modify or remove existing ones.
 */
export const upsertPrismicioRoutesConfig = async (
	context: PluginSystemContext<PluginOptions>,
): Promise<void> => {
	const file = await readPrismicioFile(context);
	if (!file) {
		return;
	}

	const routesArray = findRoutesArray(file.ast);
	if (!routesArray) {
		return;
	}

	// Get all page types from the project
	const allModels = await context.actions.readAllCustomTypeModels();
	const descriptors = Array.isArray(allModels)
		? allModels.filter(isCustomTypeDescriptor)
		: [];
	const pageTypes = descriptors
		.map((d) => d.model)
		.filter(isPageType)
		.sort((a, b) => a.id.localeCompare(b.id));

	if (pageTypes.length === 0) {
		return;
	}

	// Find which types already have routes
	const existingTypes = new Set(
		routesArray.elements.map(getRouteType).filter(Boolean),
	);

	// Add missing routes
	const missingTypes = pageTypes.filter((m) => !existingTypes.has(m.id));
	if (missingTypes.length === 0) {
		return;
	}

	for (const model of missingTypes) {
		const routeObj = createRouteObject(
			model.id,
			buildRoutePath(model.id, model.repeatable),
		);
		routesArray.elements.push(routeObj);
	}

	// Print the modified AST back to code (preserves formatting)
	const updated = recast.print(file.ast).code;

	if (updated !== file.contents) {
		await writeProjectFile({
			filename: file.filename,
			contents: updated,
			format: context.options.format,
			helpers: context.helpers,
		});
	}
};

/**
 * Removes the route config entry for a deleted page type.
 */
export const removePrismicioRoutesConfigForType = async (
	args: { customTypeID: string },
	context: PluginSystemContext<PluginOptions>,
): Promise<void> => {
	const file = await readPrismicioFile(context);
	if (!file) {
		return;
	}

	const routesArray = findRoutesArray(file.ast);
	if (!routesArray) {
		return;
	}

	// Find ALL elements with matching type (a type can have multiple route configs)
	const indicesToRemove = routesArray.elements
		.map((el, i) => (getRouteType(el) === args.customTypeID ? i : -1))
		.filter((i) => i !== -1);

	if (indicesToRemove.length === 0) {
		return;
	}

	// Process in reverse order to avoid index shifting issues
	for (let i = indicesToRemove.length - 1; i >= 0; i--) {
		const indexToRemove = indicesToRemove[i];
		const elementToRemove = routesArray.elements[indexToRemove];

		// Preserve leading comments by attaching them to the next non-deleted element
		const comments = getNodeComments(elementToRemove);
		const leadingComments = comments.filter((c) => c.leading);

		if (leadingComments.length > 0) {
			// Find next element that won't be deleted
			const nextIndex = routesArray.elements.findIndex(
				(_, idx) => idx > indexToRemove && !indicesToRemove.includes(idx),
			);

			const nextElement =
				nextIndex !== -1 ? routesArray.elements[nextIndex] : null;

			if (nextElement) {
				const existingComments = getNodeComments(nextElement);
				setNodeComments(nextElement, [...leadingComments, ...existingComments]);
			}
		}

		routesArray.elements.splice(indexToRemove, 1);
	}

	const updated = recast.print(file.ast).code;

	if (updated !== file.contents) {
		await writeProjectFile({
			filename: file.filename,
			contents: updated,
			format: context.options.format,
			helpers: context.helpers,
		});
	}
};

/**
 * Creates a Next.js page file for a page type if one doesn't exist.
 */
export const createPageTypeRouteFileIfMissing = async (
	model: PageTypeModel,
	context: PluginSystemContext<PluginOptions>,
): Promise<void> => {
	if (!isPageType(model)) {
		return;
	}

	const [hasSrcDir, hasAppRouter, isTS] = await Promise.all([
		checkHasProjectFile({ filename: "src", helpers: context.helpers }),
		checkHasAppRouter({ helpers: context.helpers }),
		checkIsTypeScriptProject({
			helpers: context.helpers,
			options: context.options,
		}),
	]);

	const routeSegment = kebabCase(model.id);
	const baseDir = path.join(
		hasSrcDir ? "src" : "",
		hasAppRouter ? "app" : "pages",
	);

	const ext = await getJSFileExtension({
		helpers: context.helpers,
		options: context.options,
		jsx: true,
	});

	const filePath = hasAppRouter
		? path.join(
				baseDir,
				routeSegment,
				model.repeatable ? `[uid]/page.${ext}` : `page.${ext}`,
			)
		: path.join(
				baseDir,
				model.repeatable
					? `${routeSegment}/[uid].${ext}`
					: `${routeSegment}.${ext}`,
			);

	if (
		await checkHasProjectFile({ filename: filePath, helpers: context.helpers })
	) {
		return;
	}

	const pageDir = path.dirname(filePath);
	const [prismicioPath, slicesPath] = await Promise.all([
		buildSrcPath({ filename: "prismicio", helpers: context.helpers }),
		buildSrcPath({ filename: "slices", helpers: context.helpers }),
	]);

	const toImportPath = (p: string): string => {
		const rel = path.relative(pageDir, p).split(path.sep).join("/");

		return rel.startsWith(".") ? rel : `./${rel}`;
	};

	const contents = generatePageComponent(model, {
		hasAppRouter,
		isTypeScript: isTS,
		importPath: toImportPath(prismicioPath),
		slicesPath: toImportPath(slicesPath),
	});

	await writeProjectFile({
		filename: filePath,
		contents,
		format: context.options.format,
		helpers: context.helpers,
	});
};
