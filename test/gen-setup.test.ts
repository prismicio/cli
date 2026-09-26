import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic gen setup [options]");
});

it("generates setup files", { timeout: 30_000 }, async ({ expect, project, prismic }) => {
	const { stderr, exitCode, stdout } = await prismic("gen", ["setup"]);
	expect(exitCode, stderr).toBe(0);
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

	const { stderr, exitCode } = await prismic("gen", ["setup"]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).toHaveFile("prismicio.js", { contains: "// custom client file" });
});

it(
	"generates valid script tags for SvelteKit",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
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

		const { stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);

		// The closing tag must be "</script>", not the bundler-escaped "<\/script>".
		await expect(project).toHaveFile("src/routes/slice-simulator/+page.svelte", {
			contains: "</script>",
		});
	},
);

it("skips installation with --no-install", async ({ expect, project, prismic }) => {
	const { stderr, exitCode, stdout } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).not.toContain("Installing dependencies");
	expect(stdout).toContain("Generated setup files");

	await expect(project).not.toHaveFile("package-lock.json");
	await expect(project).toHaveFile("prismicio.js");
});

async function useSvelteKit(project: URL, version = "5.0.0") {
	await writeFile(
		new URL("package.json", project),
		JSON.stringify({ dependencies: { "@sveltejs/kit": "latest", svelte: "latest" } }),
	);
	await mkdir(new URL("node_modules/svelte/", project), { recursive: true });
	await writeFile(
		new URL("node_modules/svelte/package.json", project),
		JSON.stringify({ version }),
	);
}

it("prints instructions for adding the preview component", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("add <PrismicPreview> to your root layout");
	expect(stdout).toContain("app/layout.jsx");
	expect(stdout).toContain('import { PrismicPreview } from "@prismicio/next";');
});

it("ignores the component in node_modules", async ({ expect, project, prismic }) => {
	// @prismicio/next ships PrismicPreview, so an installed dependency must not
	// count as the project rendering it.
	await mkdir(new URL("node_modules/@prismicio/next/", project), { recursive: true });
	await writeFile(
		new URL("node_modules/@prismicio/next/index.js", project),
		"export const PrismicPreview = () => {};",
	);

	const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("add <PrismicPreview> to your root layout");
});

it("skips the instructions when the project renders the component", async ({
	expect,
	project,
	prismic,
}) => {
	await writeFile(new URL("app/layout.jsx", project), '<PrismicPreview repositoryName="a" />');

	const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).not.toContain("PrismicPreview");
});

it(
	"does not ask for the preview component in a layout it generated itself",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useSvelteKit(project);

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).not.toContain("add <PrismicPreview>");
		await expect(project).toHaveFile("src/routes/+layout.svelte", {
			contains: "<PrismicPreview {repositoryName} />",
		});
	},
);

it("works when Next.js is declared but not installed", async ({ expect, project, prismic }) => {
	// node_modules is absent, so the Next.js version cannot be read.
	await rm(new URL("node_modules/next/", project), { recursive: true });

	const { stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).toHaveFile("app/api/revalidate/route.js");
});

it(
	"works when Svelte is declared but not installed",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		// node_modules is absent, so the Svelte version cannot be read.
		await writeFile(
			new URL("package.json", project),
			JSON.stringify({ dependencies: { "@sveltejs/kit": "latest", svelte: "latest" } }),
		);
		await mkdir(new URL("src/routes/", project), { recursive: true });
		await writeFile(new URL("src/routes/+layout.svelte", project), "{@render children()}");

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain("add <PrismicPreview> to your root layout");
	},
);

it(
	"prints Svelte 4 syntax in the instructions for a Svelte 4 project",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useSvelteKit(project, "4.2.19");
		await mkdir(new URL("src/routes/", project), { recursive: true });
		await writeFile(new URL("src/routes/+layout.svelte", project), "<slot />");

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain("<slot />");
		expect(stdout).not.toContain("{@render children()}");
	},
);

it(
	"prints SvelteKit instructions when the project already has a root layout",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useSvelteKit(project);
		await mkdir(new URL("src/routes/", project), { recursive: true });
		await writeFile(new URL("src/routes/+layout.svelte", project), "{@render children()}");

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain("src/routes/+layout.svelte");
		expect(stdout).toContain('import { PrismicPreview } from "@prismicio/svelte/kit";');
	},
);

const NUXT_STARTER_APP_VUE = `<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtWelcome />
  </div>
</template>
`;

async function useNuxt(project: URL, appVue: string) {
	await writeFile(
		new URL("package.json", project),
		JSON.stringify({ dependencies: { nuxt: "latest" } }),
	);
	await mkdir(new URL("app/", project), { recursive: true });
	await writeFile(new URL("app/app.vue", project), appVue);
}

it("deletes the Nuxt starter app.vue", async ({ expect, project, prismic }) => {
	await useNuxt(project, NUXT_STARTER_APP_VUE);

	const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).not.toContain("<NuxtPage />");

	await expect(project).not.toHaveFile("app/app.vue");
	await expect(project).not.toHaveFile("app/pages/index.vue");
});

it("keeps a customized Nuxt app.vue", async ({ expect, project, prismic }) => {
	const appVue = "<template>\n  <h1>My site</h1>\n  <NuxtWelcome />\n</template>\n";
	await useNuxt(project, appVue);

	const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("add <NuxtPage /> to app.vue");

	expect(await readFile(new URL("app/app.vue", project), "utf8")).toBe(appVue);
	await expect(project).not.toHaveFile("app/pages/index.vue");
});

it("keeps a Nuxt app.vue that renders pages", async ({ expect, project, prismic }) => {
	await useNuxt(project, "<template><NuxtPage /></template>\n");

	const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).not.toContain("<NuxtPage />");

	await expect(project).toHaveFile("app/app.vue");
});

it("keeps an existing Nuxt home page", async ({ expect, project, prismic }) => {
	await useNuxt(project, NUXT_STARTER_APP_VUE);
	await mkdir(new URL("app/pages/", project), { recursive: true });
	await writeFile(new URL("app/pages/index.vue", project), "<template>Home</template>\n");

	const { stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).not.toHaveFile("app/app.vue");
	expect(await readFile(new URL("app/pages/index.vue", project), "utf8")).toBe(
		"<template>Home</template>\n",
	);
});
