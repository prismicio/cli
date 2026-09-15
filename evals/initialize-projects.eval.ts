import { readFile, rm, writeFile } from "node:fs/promises";
import { describe } from "vitest";

import { deleteRepository, getRepositoryDomains } from "../test/prismic";
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

// Trials run one at a time: each finds the repository the agent created by
// diffing the account's repositories, which overlapping trials would confuse.
describe.sequential("without a project", () => {
	it.for(trials)(
		"creates a repository for a framework before the project exists",
		async (_, { project, agent, expect, repo, token, host, password, onTestFinished }) => {
			// A directory that has not been scaffolded yet: no framework, no Prismic config.
			await writeFile(new URL("package.json", project), JSON.stringify({ name: "my-site" }));
			await rm(new URL("node_modules/next/", project), { recursive: true });
			await rm(new URL("app/", project), { recursive: true });
			await rm(new URL("prismic.config.json", project));
			const before = await getRepositoryDomains({ token, host });

			const result = await agent(
				`Create a Prismic repository for the Nuxt site I'm about to build in this directory.`,
			);

			const after = await getRepositoryDomains({ token, host });
			// The listing lags a little, so the fixture's own repository can appear here.
			const created = after.filter((domain) => !before.includes(domain) && domain !== repo);
			onTestFinished(async () => {
				await Promise.all(
					created.map((domain) => deleteRepository(domain, { token, password, host })),
				);
			});

			expect(result).toHaveRun(["repo", "create"]);
			const create = result.calls.find(
				(argv) => argv[0] === "repo" && argv[1] === "create" && !argv.includes("--help"),
			);
			expect(create?.join(" ")).toMatch(/(--framework|-f)[ =]nuxt/);
		},
	);
});
