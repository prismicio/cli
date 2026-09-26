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
	expect(stdout).toContain(
		`Merge this into ${path.replaceAll("/", sep)}, or rerun with --force to replace it.`,
	);

	await expect(project).toHaveFile(path, { contains: "// existing page" });
});

it("replaces an existing page with --force", async ({ expect, project, prismic }) => {
	const customType = buildCustomType({ format: "page", repeatable: false });
	await writeLocalCustomType(project, customType);
	const path = `app/${customType.id.toLowerCase()}/page.jsx`;
	await mkdir(new URL(".", new URL(path, project)), { recursive: true });
	await writeFile(new URL(path, project), "// existing page");

	const { stderr, exitCode } = await prismic("gen", ["page", customType.id, "--force"]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).toHaveFile(path, { contains: `getSingle("${customType.id}"` });
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
	expect(stderr).toContain("No custom type found with ID: unknown");
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

// From create-next-app 16, shortened.
const NEXT_STARTER_PAGE = `import Image from "next/image";

export default function Home() {
  return (
    <main>
      <h1>
        To get started, edit the <code>page.tsx</code> file.
      </h1>
    </main>
  );
}
`;

const NUXT_WELCOME_PAGE = "<template><NuxtWelcome /></template>\n";

const SVELTEKIT_STARTER_PAGE = `<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
`;

async function writeHomePageType(project: URL, repo: string): Promise<string> {
	const customType = buildCustomType({ format: "page", repeatable: false });
	await writeLocalCustomType(project, customType);
	await writeFile(
		new URL("prismic.config.json", project),
		JSON.stringify({ repositoryName: repo, routes: [{ type: customType.id, path: "/" }] }),
	);
	return customType.id;
}

async function writeProjectFile(project: URL, path: string, contents: string): Promise<void> {
	await mkdir(new URL(".", new URL(path, project)), { recursive: true });
	await writeFile(new URL(path, project), contents);
}

async function useNuxt(project: URL): Promise<void> {
	await writeFile(new URL("package.json", project), JSON.stringify({ dependencies: { nuxt: "" } }));
}

async function useSvelteKit(project: URL): Promise<void> {
	await writeFile(
		new URL("package.json", project),
		JSON.stringify({ dependencies: { "@sveltejs/kit": "latest", svelte: "latest" } }),
	);
	await writeProjectFile(
		project,
		"node_modules/svelte/package.json",
		JSON.stringify({ version: "5.0.0" }),
	);
}

it("replaces the Next.js starter page", async ({ expect, project, prismic, repo }) => {
	const id = await writeHomePageType(project, repo);
	await writeFile(new URL("tsconfig.json", project), "{}");
	await writeProjectFile(project, "app/page.tsx", NEXT_STARTER_PAGE);

	const { stderr, exitCode } = await prismic("gen", ["page", id]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).toHaveFile("app/page.tsx", { contains: `getSingle("${id}"` });
});

it("keeps an edited Next.js starter page", async ({ expect, project, prismic, repo }) => {
	const id = await writeHomePageType(project, repo);
	await writeFile(new URL("tsconfig.json", project), "{}");
	const page = NEXT_STARTER_PAGE.replace("To get started, edit the", "Welcome to");
	await writeProjectFile(project, "app/page.tsx", page);

	const { stdout, stderr, exitCode } = await prismic("gen", ["page", id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Merge this into ${["app", "page.tsx"].join(sep)}`);

	await expect(project).toHaveFile("app/page.tsx", { contains: "Welcome to" });
});

it("replaces the Nuxt welcome page", async ({ expect, project, prismic, repo }) => {
	const id = await writeHomePageType(project, repo);
	await useNuxt(project);
	await writeProjectFile(project, "app/pages/index.vue", NUXT_WELCOME_PAGE);

	const { stderr, exitCode } = await prismic("gen", ["page", id]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).toHaveFile("app/pages/index.vue", { contains: "SliceZone" });
});

it("keeps an edited Nuxt welcome page", async ({ expect, project, prismic, repo }) => {
	const id = await writeHomePageType(project, repo);
	await useNuxt(project);
	const page = "<template><h1>My site</h1><NuxtWelcome /></template>\n";
	await writeProjectFile(project, "app/pages/index.vue", page);

	const { stdout, stderr, exitCode } = await prismic("gen", ["page", id]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(`Merge this into ${["app", "pages", "index.vue"].join(sep)}`);

	await expect(project).toHaveFile("app/pages/index.vue", { contains: "My site" });
});

it("removes the SvelteKit starter page", async ({ expect, project, prismic, repo }) => {
	const id = await writeHomePageType(project, repo);
	await useSvelteKit(project);
	await writeProjectFile(project, "src/routes/+page.svelte", SVELTEKIT_STARTER_PAGE);

	const { stderr, exitCode } = await prismic("gen", ["page", id]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).not.toHaveFile("src/routes/+page.svelte");
	await expect(project).toHaveFile("src/routes/[[preview=preview]]/+page.server.js", {
		contains: `getSingle("${id}"`,
	});
});

it("keeps an edited SvelteKit starter page", async ({ expect, project, prismic, repo }) => {
	const id = await writeHomePageType(project, repo);
	await useSvelteKit(project);
	const page = `${SVELTEKIT_STARTER_PAGE}<p>My content</p>\n`;
	await writeProjectFile(project, "src/routes/+page.svelte", page);

	const { stderr, exitCode } = await prismic("gen", ["page", id]);
	expect(exitCode, stderr).toBe(0);

	await expect(project).toHaveFile("src/routes/+page.svelte", { contains: "My content" });
});
