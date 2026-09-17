import { readFile, rm, writeFile } from "node:fs/promises";

import { it, trials } from "./it";

it.for(trials)(
	"initializes Prismic in a Next.js project",
	async (_, { project, agent, expect }) => {
		await rm(new URL("prismic.config.json", project));

		const result = await agent(`Set up Prismic in this Next.js project.`);

		expect(result).toHaveRun(["init"]);
		const config = JSON.parse(await readFile(new URL("prismic.config.json", project), "utf8"));
		expect(config.repositoryName).toBeTruthy();
	},
);

it.for(trials)(
	"adds Prismic to an existing Next.js app without clobbering it",
	async (_, { project, agent, expect }) => {
		await rm(new URL("prismic.config.json", project));
		const existingPage = `export default function Home() {\n\treturn <main>KEEP-ME</main>;\n}\n`;
		await writeFile(new URL("app/page.tsx", project), existingPage);

		const result = await agent(`Add Prismic to this existing Next.js app.`);

		expect(result).toHaveRun(["init"]);
		const config = JSON.parse(await readFile(new URL("prismic.config.json", project), "utf8"));
		expect(config.repositoryName).toBeTruthy();
		const page = await readFile(new URL("app/page.tsx", project), "utf8");
		expect(page).toContain("KEEP-ME");
	},
);

it.for(trials)(
	"adds the preview component to the root layout",
	async (_, { project, agent, expect }) => {
		await rm(new URL("prismic.config.json", project));
		await writeFile(
			new URL("app/layout.tsx", project),
			'<html lang="en"><body>{children}</body></html>',
		);

		const result = await agent(`Set up Prismic in this Next.js project.`);

		expect(result).toHaveRun(["init"]);
		const layout = await readFile(new URL("app/layout.tsx", project), "utf8");
		expect(layout).toContain("PrismicPreview");
	},
);

it.for(trials)(
	"initializes with an existing repository",
	async (_, { project, agent, expect, repo }) => {
		await rm(new URL("prismic.config.json", project));

		const result = await agent(
			`Set up Prismic in this project using the existing "${repo}" Prismic repository.`,
		);

		expect(result).toHaveRun(["init"]);
		const config = JSON.parse(await readFile(new URL("prismic.config.json", project), "utf8"));
		expect(config.repositoryName).toBe(repo);
	},
);

it.for(trials)(
	"creates a repository for a framework before the project exists",
	async (_, { project, agent, expect }) => {
		// A directory that has not been scaffolded yet: no framework, no Prismic config.
		await writeFile(new URL("package.json", project), JSON.stringify({ name: "my-site" }));
		await rm(new URL("node_modules/next/", project), { recursive: true });
		await rm(new URL("app/", project), { recursive: true });
		await rm(new URL("prismic.config.json", project));

		const result = await agent(
			`Create a Prismic repository for the Nuxt site I'm about to build in this directory.`,
		);

		const commands = result.calls.map((argv) => argv.join(" "));
		expect(commands).toContainEqual(
			expect.stringMatching(/^repo create .*(--framework|-f)[ =]nuxt/),
		);
	},
);
