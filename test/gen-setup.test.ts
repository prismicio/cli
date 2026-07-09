import { mkdir, readFile, writeFile } from "node:fs/promises";

import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("gen", ["setup", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic gen setup [options]");
});

it("generates setup files", { timeout: 30_000 }, async ({ expect, project, prismic }) => {
	const { exitCode, stdout } = await prismic("gen", ["setup"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Generated setup files");

	// Test fixture is a Next.js App Router project without tsconfig.json,
	// so files use .js/.jsx extensions.
	await expect(project).toHaveFile("prismicio.js");
	await expect(project).toHaveFile("app/slice-simulator/page.jsx");
	await expect(project).toHaveFile("app/api/preview/route.js");
	await expect(project).toHaveFile("app/api/exit-preview/route.js");
	await expect(project).toHaveFile("app/api/revalidate/route.js");

	// Check for package installation
	await expect(project).toHaveFile("package-lock.json");
});

it("skips existing files", { timeout: 30_000 }, async ({ expect, project, prismic }) => {
	const customContent = "// custom client file\n";
	await writeFile(new URL("prismicio.js", project), customContent);

	const { exitCode } = await prismic("gen", ["setup"]);
	expect(exitCode).toBe(0);

	await expect(project).toHaveFile("prismicio.js", { contains: "// custom client file" });
});

it("generates valid script tags for SvelteKit", { timeout: 30_000 }, async ({
	expect,
	project,
	prismic,
}) => {
	// Reconfigure the fixture as a SvelteKit project so a file with a <script>
	// block is generated (the simulator page).
	await writeFile(
		new URL("package.json", project),
		JSON.stringify({ dependencies: { "@sveltejs/kit": "latest", svelte: "latest" } }),
	);
	await mkdir(new URL("node_modules/svelte/", project), { recursive: true });
	await writeFile(
		new URL("node_modules/svelte/package.json", project),
		JSON.stringify({ version: "5.0.0" }),
	);

	const { exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode).toBe(0);

	// The closing tag must be "</script>", not the bundler-escaped "<\/script>".
	await expect(project).toHaveFile("src/routes/slice-simulator/+page.svelte", {
		contains: "</script>",
	});
});

it("adds the env register import to the framework config", { timeout: 30_000 }, async ({
	expect,
	project,
	prismic,
}) => {
	const configPath = new URL("next.config.mjs", project);
	await writeFile(configPath, "export default {};\n");

	const { exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode).toBe(0);

	const contents = await readFile(configPath, "utf8");
	expect(contents).toBe('import "prismic/env/register";\n\nexport default {};\n');

	// The import needs `prismic` installed to resolve, so it is added as a dependency.
	const packageJson = JSON.parse(await readFile(new URL("package.json", project), "utf8"));
	expect(packageJson.dependencies).toHaveProperty("prismic");
});

it("skips the env register import for a CommonJS config", { timeout: 30_000 }, async ({
	expect,
	project,
	prismic,
}) => {
	// The fixture's package.json has no "type": "module", so a .js config is CommonJS.
	const configPath = new URL("next.config.js", project);
	await writeFile(configPath, "module.exports = {};\n");

	const { exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode).toBe(0);

	const contents = await readFile(configPath, "utf8");
	expect(contents).toBe("module.exports = {};\n");
});

it("skips installation with --no-install", async ({ expect, project, prismic }) => {
	const { exitCode, stdout } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode).toBe(0);
	expect(stdout).not.toContain("Installing dependencies");
	expect(stdout).toContain("Generated setup files");

	await expect(project).not.toHaveFile("package-lock.json");
	await expect(project).toHaveFile("prismicio.js");
});
