import { readdir, readFile, rm, writeFile } from "node:fs/promises";

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
		// The fixture project has no tsconfig.json, so the layout is JavaScript.
		// KEEP-ME catches an agent that replaces the layout instead of adding to it.
		await writeFile(
			new URL("app/layout.jsx", project),
			"export default function RootLayout({ children }) {\n" +
				'\treturn (\n\t\t<html lang="en">\n\t\t\t<body>\n\t\t\t\t<p>KEEP-ME</p>\n' +
				"\t\t\t\t{children}\n\t\t\t</body>\n\t\t</html>\n\t);\n}\n",
		);

		const result = await agent(`Set up Prismic in this Next.js project.`);

		expect(result).toHaveRun(["init"]);
		// Agents sometimes rename the layout to match the project's language.
		const appDirectory = new URL("app/", project);
		const files = await readdir(appDirectory);
		const layoutFile = files.find((file) => /^layout\.[jt]sx?$/.test(file));
		expect(layoutFile, `app/ has ${files.join(", ")}`).toBeTruthy();
		const layout = await readFile(new URL(layoutFile!, appDirectory), "utf8");
		expect(layout).toContain("PrismicPreview");
		expect(layout).toContain("KEEP-ME");
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
