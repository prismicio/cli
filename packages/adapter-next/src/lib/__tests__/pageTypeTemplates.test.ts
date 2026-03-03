import { describe, it, expect } from "vitest";

import type { PageTypeModel } from "../pageType";
import {
	generatePageComponent,
	type PageComponentEnv,
} from "../pageTypeTemplates";

const createModel = (
	overrides: Partial<PageTypeModel> = {},
): PageTypeModel => ({
	id: "test_page",
	format: "page",
	...overrides,
});

const createEnv = (
	overrides: Partial<PageComponentEnv> = {},
): PageComponentEnv => ({
	hasAppRouter: true,
	isTypeScript: true,
	importPath: "@/prismicio",
	slicesPath: "@/slices",
	...overrides,
});

describe("generatePageComponent", () => {
	describe("App Router", () => {
		describe("TypeScript", () => {
			it("generates repeatable page", () => {
				const output = generatePageComponent(
					createModel({ id: "blog_post", repeatable: true }),
					createEnv({ hasAppRouter: true, isTypeScript: true }),
				);

				expect(output).toMatchSnapshot();
			});

			it("generates singleton page", () => {
				const output = generatePageComponent(
					createModel({ id: "homepage", repeatable: false }),
					createEnv({ hasAppRouter: true, isTypeScript: true }),
				);

				expect(output).toMatchSnapshot();
			});
		});

		describe("JavaScript", () => {
			it("generates repeatable page", () => {
				const output = generatePageComponent(
					createModel({ id: "blog_post", repeatable: true }),
					createEnv({ hasAppRouter: true, isTypeScript: false }),
				);

				expect(output).toMatchSnapshot();
			});

			it("generates singleton page", () => {
				const output = generatePageComponent(
					createModel({ id: "homepage", repeatable: false }),
					createEnv({ hasAppRouter: true, isTypeScript: false }),
				);

				expect(output).toMatchSnapshot();
			});
		});
	});

	describe("Pages Router", () => {
		describe("TypeScript", () => {
			it("generates repeatable page", () => {
				const output = generatePageComponent(
					createModel({ id: "blog_post", repeatable: true }),
					createEnv({ hasAppRouter: false, isTypeScript: true }),
				);

				expect(output).toMatchSnapshot();
			});

			it("generates singleton page", () => {
				const output = generatePageComponent(
					createModel({ id: "homepage", repeatable: false }),
					createEnv({ hasAppRouter: false, isTypeScript: true }),
				);

				expect(output).toMatchSnapshot();
			});
		});

		describe("JavaScript", () => {
			it("generates repeatable page", () => {
				const output = generatePageComponent(
					createModel({ id: "blog_post", repeatable: true }),
					createEnv({ hasAppRouter: false, isTypeScript: false }),
				);

				expect(output).toMatchSnapshot();
			});

			it("generates singleton page", () => {
				const output = generatePageComponent(
					createModel({ id: "homepage", repeatable: false }),
					createEnv({ hasAppRouter: false, isTypeScript: false }),
				);

				expect(output).toMatchSnapshot();
			});
		});
	});
});
