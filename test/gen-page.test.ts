import { mkdir, writeFile } from "node:fs/promises";
import { sep } from "node:path";

import { buildCustomType, it, writeLocalCustomType } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("gen", ["page", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic gen page <type-id> [options]");
});

it("writes a missing page", async ({ expect, project, prismic }) => {
	const customType = buildCustomType({ format: "page", repeatable: false });
	await writeLocalCustomType(project, customType);

	const { stdout, stderr, exitCode } = await prismic("gen", ["page", customType.id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Generated the page for "${customType.id}"`);

	await expect(project).toHaveFile(`app/${customType.id.toLowerCase()}/page.jsx`, {
		contains: `getSingle("${customType.id}"`,
	});
});

it("prints the code for an existing page", async ({ expect, project, prismic }) => {
	const customType = buildCustomType({ format: "page", repeatable: false });
	await writeLocalCustomType(project, customType);
	// create-next-app names JavaScript pages page.js, while the CLI writes page.jsx.
	const path = `app/${customType.id.toLowerCase()}/page.js`;
	await mkdir(new URL(".", new URL(path, project)), { recursive: true });
	await writeFile(new URL(path, project), "// existing page");

	const { stdout, stderr, exitCode } = await prismic("gen", ["page", customType.id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`getSingle("${customType.id}"`);
	await expect(project).not.toHaveFile(`app/${customType.id.toLowerCase()}/page.jsx`);
	expect(stdout).toContain(`Merge this into ${path.replaceAll("/", sep)}.`);

	await expect(project).toHaveFile(path, { contains: "// existing page" });
});

it("errors for a non-page type", async ({ expect, project, prismic }) => {
	const customType = buildCustomType({ format: "custom" });
	await writeLocalCustomType(project, customType);

	const { stderr, exitCode } = await prismic("gen", ["page", customType.id]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain(`"${customType.id}" is not a page type.`);
});

it("errors for an unknown type", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("gen", ["page", "unknown"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Type "unknown" not found.');
	expect(stderr).not.toContain("The CLI reached a bug");
});

it("uses the route from prismic.config.json", async ({ expect, project, prismic, repo }) => {
	const customType = buildCustomType({ format: "page", repeatable: true });
	await writeLocalCustomType(project, customType);
	await writeFile(
		new URL("prismic.config.json", project),
		JSON.stringify({
			repositoryName: repo,
			routes: [{ type: customType.id, path: "/articles/:uid" }],
		}),
	);

	const { stderr, exitCode } = await prismic("gen", ["page", customType.id]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).toHaveFile("app/articles/[uid]/page.jsx", {
		contains: `getByUID("${customType.id}"`,
	});
});

it("skips routes for a single document", async ({ expect, project, prismic, repo }) => {
	const customType = buildCustomType({ format: "page", repeatable: true });
	await writeLocalCustomType(project, customType);
	await writeFile(
		new URL("prismic.config.json", project),
		JSON.stringify({
			repositoryName: repo,
			routes: [
				{ type: customType.id, uid: "home", path: "/" },
				{ type: customType.id, path: "/articles/:uid" },
			],
		}),
	);

	const { stderr, exitCode } = await prismic("gen", ["page", customType.id]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).toHaveFile("app/articles/[uid]/page.jsx", {
		contains: `getByUID("${customType.id}"`,
	});
	await expect(project).not.toHaveFile("app/page.jsx");
});

it("treats an existing page.ts as the page", async ({ expect, project, prismic }) => {
	const customType = buildCustomType({ format: "page", repeatable: false });
	await writeLocalCustomType(project, customType);
	const directory = `app/${customType.id.toLowerCase()}/`;
	await mkdir(new URL(directory, project), { recursive: true });
	await writeFile(new URL(`${directory}page.ts`, project), "// existing page");

	const { stdout, stderr, exitCode } = await prismic("gen", ["page", customType.id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(
		`${[...directory.split("/").filter(Boolean), "page.ts"].join(sep)} already exists`,
	);
	await expect(project).not.toHaveFile(`${directory}page.jsx`);
});

it("uses the default path for a route with an optional param", async ({
	expect,
	project,
	prismic,
	repo,
}) => {
	const customType = buildCustomType({ format: "page", repeatable: true });
	await writeLocalCustomType(project, customType);
	await writeFile(
		new URL("prismic.config.json", project),
		JSON.stringify({
			repositoryName: repo,
			routes: [{ type: customType.id, path: "/:lang?/articles/:uid" }],
		}),
	);

	const { stdout, stderr, exitCode } = await prismic("gen", ["page", customType.id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(
		`The route /:lang?/articles/:uid has optional or repeated params, so the page uses the default path /${customType.id.toLowerCase()}/:uid.`,
	);

	await expect(project).toHaveFile(`app/${customType.id.toLowerCase()}/[uid]/page.jsx`);
	await expect(project).not.toHaveFile("app/[lang?]/articles/[uid]/page.jsx");
});
