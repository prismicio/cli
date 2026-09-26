import { readdir, readFile, rm, writeFile } from "node:fs/promises";

import { buildCustomType, writeLocalCustomType } from "../test/it";
import { it, trials } from "./it";

// From create-next-app 16, shortened. The fixture has no tsconfig.json, so it is page.js.
const NEXT_STARTER_PAGE = `import Image from "next/image";

export default function Home() {
  return (
    <main>
      <h1>
        To get started, edit the <code>page.js</code> file.
      </h1>
    </main>
  );
}
`;

// Agents sometimes rename the page to match the project's language.
async function readPages(directory: URL): Promise<string> {
	const files = await readdir(directory).catch(() => []);
	const pages = files.filter((file) => /^page\.[jt]sx?$/.test(file));
	const contents = await Promise.all(
		pages.map((file) => readFile(new URL(file, directory), "utf8")),
	);
	return contents.join("\n");
}

it.for(trials)(
	"replaces the Next.js starter with a home page",
	async (_, { project, agent, expect }) => {
		await writeFile(new URL("app/page.js", project), NEXT_STARTER_PAGE);

		await agent(`Create a home page type for this website's home page at /.`);

		const page = await readPages(new URL("app/", project));
		expect(page).toContain("SliceZone");
		expect(page).not.toContain("To get started");
	},
);

it.for(trials)(
	"merges a home page into the developer's page",
	async (_, { project, agent, expect }) => {
		await writeFile(
			new URL("app/page.js", project),
			"export default function Home() {\n" +
				"\treturn (\n\t\t<main>\n\t\t\t<h1>Acme</h1>\n\t\t\t<p>KEEP-ME</p>\n\t\t</main>\n\t);\n}\n",
		);

		const result = await agent(`Create a home page type for this website's home page at /.`);

		expect(result).toHaveRun(["gen", "page"]);
		const page = await readPages(new URL("app/", project));
		expect(page).toMatch(/SliceZone|getSingle\(/);
		expect(page).toContain("KEEP-ME");
	},
);

it.for(trials)(
	"generates a page at a changed route",
	async (_, { project, agent, expect, repo }) => {
		const blogPost = buildCustomType({
			id: "blog_post",
			label: "Blog Post",
			format: "page",
			json: {
				Main: {
					uid: { type: "UID", config: { label: "UID" } },
					slices: { type: "Slices", fieldset: "Slice Zone", config: { choices: {} } },
				},
			},
		});
		await writeLocalCustomType(project, blogPost);
		await writeFile(
			new URL("prismic.config.json", project),
			JSON.stringify({
				repositoryName: repo,
				routes: [{ type: "blog_post", path: "/blog-post/:uid" }],
			}),
		);

		await agent(
			`Serve blog posts at /articles/<uid> instead of /blog-post/<uid>, and make sure a page renders them at the new URL.`,
		);

		const page = await readPages(new URL("app/articles/[uid]/", project));
		expect(page).toContain("blog_post");
	},
);

it.for(trials)(
	"creates a Nuxt home page after init",
	async (_, { project, agent, expect, repo }) => {
		await writeFile(
			new URL("package.json", project),
			JSON.stringify({ dependencies: { nuxt: "" } }),
		);
		await rm(new URL("prismic.config.json", project));
		await writeFile(new URL("nuxt.config.ts", project), "export default defineNuxtConfig({});\n");
		// The fixture's app/ directory is Nuxt 4's source directory.
		await writeFile(
			new URL("app/app.vue", project),
			"<template>\n  <div>\n    <NuxtRouteAnnouncer />\n    <NuxtWelcome />\n  </div>\n</template>\n",
		);

		const result = await agent(
			`Set up Prismic in this Nuxt project using the existing "${repo}" Prismic repository.`,
		);
		expect(result).toHaveRun(["init"]);

		await result.continue(`Create a home page type for this website's home page at /.`);

		const page = await readFile(new URL("app/pages/index.vue", project), "utf8");
		expect(page).toContain("SliceZone");
	},
);
