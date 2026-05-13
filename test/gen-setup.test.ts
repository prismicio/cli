import { writeFile } from "node:fs/promises";

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

it("skips installation with --no-install", async ({ expect, project, prismic }) => {
	const { exitCode, stdout } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode).toBe(0);
	expect(stdout).not.toContain("Installing dependencies");
	expect(stdout).toContain("Generated setup files");

	await expect(project).not.toHaveFile("package-lock.json");
	await expect(project).toHaveFile("prismicio.js");
});
