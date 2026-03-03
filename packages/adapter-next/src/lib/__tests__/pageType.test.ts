import * as recast from "recast";
import * as typescriptParser from "recast/parsers/typescript.js";
import { describe, it, expect } from "vitest";

import { findRoutesArray, getRouteType } from "../pageType";

const parseCode = (code: string) =>
	recast.parse(code, { parser: typescriptParser });

describe("findRoutesArray", () => {
	it("finds routes array with type annotation", () => {
		const ast = parseCode(`
			const routes: Route[] = [
				{ type: "page", path: "/" },
				{ type: "blog_post", path: "/blog/:uid" },
			];
		`);

		const result = findRoutesArray(ast);

		expect(result).toBeDefined();
		expect(result?.elements).toHaveLength(2);
	});

	it("returns undefined when routes is not an array", () => {
		const ast = parseCode(`const routes = "not an array";`);

		const result = findRoutesArray(ast);

		expect(result).toBeUndefined();
	});

	it("returns undefined when routes is not declared", () => {
		const ast = parseCode(`const otherVar = [];`);

		const result = findRoutesArray(ast);

		expect(result).toBeUndefined();
	});
});

describe("getRouteType", () => {
	const getFirstElement = (code: string) => {
		const ast = parseCode(code);
		const routes = findRoutesArray(ast);

		return routes?.elements[0];
	};

	it("extracts type from route object", () => {
		const element = getFirstElement(`
			const routes = [{ type: "blog_post", path: "/blog/:uid" }];
		`);

		expect(getRouteType(element)).toBe("blog_post");
	});

	it("returns undefined for non-object elements", () => {
		expect(getRouteType("string")).toBeUndefined();
		expect(getRouteType(null)).toBeUndefined();
	});

	it("returns undefined when type property is missing", () => {
		const element = getFirstElement(`
			const routes = [{ path: "/" }];
		`);

		expect(getRouteType(element)).toBeUndefined();
	});
});
