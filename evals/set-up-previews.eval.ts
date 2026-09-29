import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

import { useSvelteKit } from "../test/it";
import { it, trials } from "./it";

it.for(trials)(
	"adds the preview component to a Next.js root layout",
	async (_, { project, agent, expect }) => {
		// The fixture project has no tsconfig.json, so the layout is JavaScript.
		// KEEP-ME catches an agent that replaces the layout instead of adding to it.
		await writeFile(
			new URL("app/layout.jsx", project),
			"export default function RootLayout({ children }) {\n" +
				'\treturn (\n\t\t<html lang="en">\n\t\t\t<body>\n\t\t\t\t<p>KEEP-ME</p>\n' +
				"\t\t\t\t{children}\n\t\t\t</body>\n\t\t</html>\n\t);\n}\n",
		);

		await agent(`Set up previews for this website. It is not deployed yet, so use localhost.`);

		// Agents sometimes rename the layout to match the project's language.
		const appDirectory = new URL("app/", project);
		const files = await readdir(appDirectory);
		const layoutFile = files.find((file) => /^layout\.[jt]sx?$/.test(file));
		expect(layoutFile, `app/ has ${files.join(", ")}`).toBeTruthy();
		const layout = await readFile(new URL(layoutFile!, appDirectory), "utf8");
		expect(layout).toContain("PrismicPreview");
		expect(layout).toContain("@prismicio/next");
		expect(layout).toContain("KEEP-ME");
	},
);

it.for(trials)(
	"adds the preview component to a SvelteKit root layout",
	async (_, { project, agent, expect }) => {
		await useSvelteKit(project);
		// A stock `sv create` layout. KEEP-ME catches an agent that replaces it.
		await mkdir(new URL("src/routes/", project), { recursive: true });
		await writeFile(
			new URL("src/routes/+layout.svelte", project),
			"<script>\n\timport favicon from '$lib/assets/favicon.svg';\n\n" +
				"\tlet { children } = $props();\n</script>\n\n" +
				'<svelte:head>\n\t<link rel="icon" href={favicon} />\n</svelte:head>\n\n' +
				"<p>KEEP-ME</p>\n{@render children()}\n",
		);

		await agent(`Set up previews for this website. It is not deployed yet, so use localhost.`);

		const routesDirectory = new URL("src/routes/", project);
		const layout = await readFile(new URL("+layout.svelte", routesDirectory), "utf8");
		expect(layout).toContain("PrismicPreview");
		expect(layout).toContain("data.repositoryName");
		expect(layout).toContain("KEEP-ME");
		const serverLayout = await readServerLayout(routesDirectory);
		expect(serverLayout).toContain("load");
		expect(serverLayout).toContain("repositoryName");
	},
);

it.for(trials)(
	"adds repositoryName to an existing SvelteKit server layout",
	async (_, { project, agent, expect }) => {
		await useSvelteKit(project);
		await mkdir(new URL("src/routes/", project), { recursive: true });
		await writeFile(
			new URL("src/routes/+layout.server.ts", project),
			'export const load = () => {\n\treturn { user: "x" };\n};\n',
		);

		await agent(`Set up previews for this website. It is not deployed yet, so use localhost.`);

		const serverLayout = await readServerLayout(new URL("src/routes/", project));
		expect(serverLayout).toMatch(/\buser\b/);
		expect(serverLayout).toContain("repositoryName");
	},
);

async function readServerLayout(routesDirectory: URL): Promise<string> {
	// Agents sometimes rename the file to match the project's language.
	const files = await readdir(routesDirectory);
	const file = files.find((file) => /^\+layout\.server\.[jt]s$/.test(file));
	return file ? await readFile(new URL(file, routesDirectory), "utf8") : "";
}
