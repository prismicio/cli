import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { sep } from "node:path";

import { failInstall, it, useSvelteKit } from "./it";

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

it("reports a new major version of an existing dependency", async ({
	expect,
	project,
	prismic,
}) => {
	await writeFile(
		new URL("package.json", project),
		JSON.stringify({ dependencies: { next: "latest", "@prismicio/client": "^6.0.0" } }),
	);

	const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toMatch(
		/Updated @prismicio\/client from \^6\.0\.0 to \^\d+\S*\. Check your code for breaking changes/,
	);
});

it("updates a dev dependency where it is listed", async ({ expect, project, prismic }) => {
	await writeFile(
		new URL("package.json", project),
		JSON.stringify({
			dependencies: { next: "latest" },
			devDependencies: { "@prismicio/client": "^7.0.0" },
		}),
	);

	const { stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	const packageJson = JSON.parse(await readFile(new URL("package.json", project), "utf8"));
	expect(packageJson.dependencies).not.toHaveProperty("@prismicio/client");
	expect(packageJson.devDependencies).toHaveProperty("@prismicio/client");
});

it("does not report an update from a range without a version", async ({
	expect,
	project,
	prismic,
}) => {
	await writeFile(
		new URL("package.json", project),
		JSON.stringify({ dependencies: { next: "latest", "@prismicio/client": "latest" } }),
	);

	const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).not.toContain("Updated @prismicio/client");
});

it("tells the user how to finish when the install fails", async ({ expect, project, prismic }) => {
	await failInstall(project);

	const { stderr, exitCode } = await prismic("gen", ["setup"]);
	expect(exitCode, stderr).toBe(0);
	expect(stderr).toContain("Could not install dependencies. Run `npm install` to finish.");
	expect(stderr).toContain("The rest of the setup is done.");
});

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
		const layout = await readFile(new URL("src/routes/+layout.svelte", project), "utf8");
		expect(layout).toContain("const { data, children } = $props();");
		expect(layout).toContain("<PrismicPreview repositoryName={data.repositoryName} />");
		expect(layout).not.toContain("$lib/prismicio");
	},
);

it(
	"passes the repository name to a Svelte 4 layout it generated itself",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useSvelteKit(project, "4.2.19");

		const { stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		const layout = await readFile(new URL("src/routes/+layout.svelte", project), "utf8");
		expect(layout).toContain("export let data;");
		expect(layout).toContain("<PrismicPreview repositoryName={data.repositoryName} />");
		expect(layout).not.toContain("$lib/prismicio");
	},
);

it(
	"returns the repository name from a SvelteKit server layout",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useSvelteKit(project);

		const { stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		const serverLayout = await readFile(new URL("src/routes/+layout.server.js", project), "utf8");
		expect(serverLayout).toContain('import { repositoryName } from "$lib/prismicio";');
		expect(serverLayout).toContain('export const prerender = "auto";');
		expect(serverLayout).toContain("return { repositoryName };");
	},
);

it(
	"leaves the Vite config unchanged",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useSvelteKit(project);
		const viteConfig =
			'import { sveltekit } from "@sveltejs/kit/vite";\n' +
			'import { defineConfig } from "vite";\n\n' +
			"export default defineConfig({ plugins: [sveltekit()] });\n";
		await writeFile(new URL("vite.config.js", project), viteConfig);

		const { stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		expect(await readFile(new URL("vite.config.js", project), "utf8")).toBe(viteConfig);
	},
);

it(
	"asks for the repository name in an existing SvelteKit server layout",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useSvelteKit(project);
		await mkdir(new URL("src/routes/", project), { recursive: true });
		await writeFile(new URL("src/routes/+layout.svelte", project), "{@render children()}");
		const serverLayout = 'export const load = () => ({ user: "x" });';
		await writeFile(new URL("src/routes/+layout.server.js", project), serverLayout);

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		expect(await readFile(new URL("src/routes/+layout.server.js", project), "utf8")).toBe(
			serverLayout,
		);
		expect(stdout).toContain("<PrismicPreview repositoryName={data.repositoryName} />");
		expect(stdout).toContain("Return repositoryName from load in src/routes/+layout.server.js");
	},
);

it(
	"asks for the repository name in a server layout written in the other language",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useSvelteKit(project);
		await mkdir(new URL("src/routes/", project), { recursive: true });
		await writeFile(new URL("src/routes/+layout.svelte", project), "{@render children()}");
		await writeFile(
			new URL("src/routes/+layout.server.ts", project),
			'export const load = () => ({ user: "x" });',
		);

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		await expect(project).not.toHaveFile("src/routes/+layout.server.js");
		expect(stdout).toContain("Return repositoryName from load in src/routes/+layout.server.ts");
	},
);

it(
	"does not generate a layout next to a server layout without the repository name",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useSvelteKit(project);
		await mkdir(new URL("src/routes/", project), { recursive: true });
		await writeFile(
			new URL("src/routes/+layout.server.js", project),
			'export const load = () => ({ user: "x" });',
		);

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		await expect(project).not.toHaveFile("src/routes/+layout.svelte");
		expect(stdout).toContain("<PrismicPreview repositoryName={data.repositoryName} />");
		expect(stdout).toContain("Return repositoryName from load in src/routes/+layout.server.js");
	},
);

it(
	"does not ask for the repository name in a server layout that already returns it",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useSvelteKit(project);
		await mkdir(new URL("src/routes/", project), { recursive: true });
		await writeFile(new URL("src/routes/+layout.svelte", project), "{@render children()}");
		await writeFile(
			new URL("src/routes/+layout.server.js", project),
			'import { repositoryName } from "$lib/prismicio";\nexport const load = () => ({ repositoryName });',
		);

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain("<PrismicPreview repositoryName={data.repositoryName} />");
		expect(stdout).not.toContain("+layout.server");
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
		expect(stdout).toContain("+   export let data;");
		expect(stdout).toContain("<slot />");
		expect(stdout).not.toContain("{@render children()}");
		expect(stdout).not.toContain("$props()");
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
		expect(stdout).toContain("-   let { children } = $props();");
		expect(stdout).toContain("+   let { data, children } = $props();");
		expect(stdout).toContain("+ <PrismicPreview repositoryName={data.repositoryName} />");
		expect(stdout).toContain("prismic docs view sveltekit");
	},
);

async function useNuxt(
	project: URL,
	cli?: { addsModule?: boolean; exitCode?: number },
): Promise<void> {
	await writeFile(
		new URL("package.json", project),
		JSON.stringify({ dependencies: { nuxt: "latest" } }),
	);
	await writeFile(new URL("nuxt.config.ts", project), "export default defineNuxtConfig({});\n");
	if (!cli) return;

	// A fake Nuxt CLI that records its arguments, with npm-style shims for POSIX and Windows.
	const bin = new URL("node_modules/.bin/", project);
	await mkdir(bin, { recursive: true });
	const config = 'export default defineNuxtConfig({ modules: ["@nuxtjs/prismic"] });\n';
	await writeFile(
		new URL("nuxt.mjs", bin),
		'import { appendFileSync, writeFileSync } from "node:fs";\n' +
			'appendFileSync("nuxt-args.txt", process.argv.slice(2).join(" "));\n' +
			(cli.addsModule ? `writeFileSync("nuxt.config.ts", ${JSON.stringify(config)});\n` : "") +
			`process.exitCode = ${cli.exitCode ?? 0};\n`,
	);
	await writeFile(new URL("nuxt", bin), '#!/bin/sh\nexec node "$(dirname "$0")/nuxt.mjs" "$@"\n', {
		mode: 0o755,
	});
	await writeFile(new URL("nuxt.cmd", bin), '@node "%~dp0\\nuxt.mjs" %*\r\n');
}

const NUXT_MODULE_INSTRUCTION = 'add "@nuxtjs/prismic" to modules in nuxt.config';

it(
	"registers the Nuxt module with the Nuxt CLI",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useNuxt(project, { addsModule: true });

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		expect(await readFile(new URL("nuxt-args.txt", project), "utf8")).toBe(
			"module add @nuxtjs/prismic --skipInstall",
		);
		expect(stdout).not.toContain(NUXT_MODULE_INSTRUCTION);
	},
);

it(
	"does not run the Nuxt CLI when the Nuxt module is registered",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useNuxt(project, { addsModule: true });
		await writeFile(
			new URL("nuxt.config.ts", project),
			'export default defineNuxtConfig({ modules: [["@nuxtjs/prismic", { preview: "/preview" }]] });\n',
		);

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		await expect(project).not.toHaveFile("nuxt-args.txt");
		expect(stdout).not.toContain(NUXT_MODULE_INSTRUCTION);
	},
);

it(
	"finds the Nuxt module in a nuxt.config.mjs file",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useNuxt(project, { addsModule: true });
		await rm(new URL("nuxt.config.ts", project));
		await writeFile(
			new URL("nuxt.config.mjs", project),
			'export default defineNuxtConfig({ modules: ["@nuxtjs/prismic"] });\n',
		);

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		await expect(project).not.toHaveFile("nuxt-args.txt");
		expect(stdout).not.toContain(NUXT_MODULE_INSTRUCTION);
	},
);

it(
	"asks for the Nuxt module when the Nuxt CLI exits without adding it",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useNuxt(project, { exitCode: 0 });

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		await expect(project).toHaveFile("nuxt-args.txt");
		expect(stdout).toContain(NUXT_MODULE_INSTRUCTION);
	},
);

it(
	"asks for the Nuxt module when the Nuxt CLI fails",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useNuxt(project, { exitCode: 1 });

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		await expect(project).toHaveFile("nuxt-args.txt");
		expect(stdout).toContain(NUXT_MODULE_INSTRUCTION);
	},
);

it(
	"asks for the Nuxt module when the Nuxt CLI is not installed",
	{ timeout: 30_000 },
	async ({ expect, project, prismic }) => {
		await useNuxt(project);

		const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain(NUXT_MODULE_INSTRUCTION);
		await expect(project).toHaveFile("nuxt.config.ts", {
			contains: "export default defineNuxtConfig({});",
		});
	},
);

const NUXT_STARTER_APP_VUE = `<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtWelcome />
  </div>
</template>
`;

async function useNuxtWithAppVue(project: URL, appVue: string) {
	await useNuxt(project);
	await mkdir(new URL("app/", project), { recursive: true });
	await writeFile(new URL("app/app.vue", project), appVue);
}

it("deletes the Nuxt starter app.vue", async ({ expect, project, prismic }) => {
	await useNuxtWithAppVue(project, NUXT_STARTER_APP_VUE);

	const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).not.toContain("<NuxtPage />");

	await expect(project).not.toHaveFile("app/app.vue");
	await expect(project).not.toHaveFile("app/pages/index.vue");
});

it("keeps a customized Nuxt app.vue", async ({ expect, project, prismic }) => {
	const appVue = "<template>\n  <h1>My site</h1>\n  <NuxtWelcome />\n</template>\n";
	await useNuxtWithAppVue(project, appVue);

	const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`add <NuxtPage /> to ${["app", "app.vue"].join(sep)}`);
	expect(stdout).toContain("+     <NuxtPage />");

	expect(await readFile(new URL("app/app.vue", project), "utf8")).toBe(appVue);
	await expect(project).not.toHaveFile("app/pages/index.vue");
});

it("keeps a Nuxt app.vue that renders pages", async ({ expect, project, prismic }) => {
	await useNuxtWithAppVue(project, "<template><NuxtPage /></template>\n");

	const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).not.toContain("<NuxtPage />");

	await expect(project).toHaveFile("app/app.vue");
});

it("keeps an existing Nuxt home page", async ({ expect, project, prismic }) => {
	await useNuxtWithAppVue(project, NUXT_STARTER_APP_VUE);
	await mkdir(new URL("app/pages/", project), { recursive: true });
	await writeFile(new URL("app/pages/index.vue", project), "<template>Home</template>\n");

	const { stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).not.toHaveFile("app/app.vue");
	expect(await readFile(new URL("app/pages/index.vue", project), "utf8")).toBe(
		"<template>Home</template>\n",
	);
});

it("asks for both the Nuxt module and <NuxtPage />", async ({ expect, project, prismic }) => {
	await useNuxtWithAppVue(project, "<template>\n  <h1>My site</h1>\n</template>\n");

	const { stdout, stderr, exitCode } = await prismic("gen", ["setup", "--no-install"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(NUXT_MODULE_INSTRUCTION);
	expect(stdout).toContain(`Action required: add <NuxtPage /> to ${["app", "app.vue"].join(sep)}.`);
});
