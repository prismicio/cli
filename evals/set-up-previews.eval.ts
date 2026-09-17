import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { it, trials } from "./it";

it.for(trials)(
	"adds the preview component to a Next.js root layout",
	async (_, { project, agent, expect }) => {
		await writeFile(
			new URL("app/layout.tsx", project),
			"export default function RootLayout({ children }: { children: React.ReactNode }) {\n" +
				'\treturn (\n\t\t<html lang="en">\n\t\t\t<body>{children}</body>\n\t\t</html>\n\t);\n}\n',
		);

		await agent(`Set up previews for this website.`);

		const layout = await readFile(new URL("app/layout.tsx", project), "utf8");
		expect(layout).toContain("PrismicPreview");
		expect(layout).toContain("@prismicio/next");
	},
);

it.for(trials)(
	"adds the preview component to a SvelteKit root layout",
	async (_, { project, agent, expect }) => {
		await rm(new URL("app/", project), { recursive: true });
		await rm(new URL("node_modules/next/", project), { recursive: true });
		await writeFile(
			new URL("package.json", project),
			JSON.stringify({ dependencies: { "@sveltejs/kit": "latest", svelte: "latest" } }),
		);
		await mkdir(new URL("node_modules/svelte/", project), { recursive: true });
		await writeFile(
			new URL("node_modules/svelte/package.json", project),
			JSON.stringify({ version: "5.0.0" }),
		);
		// A root layout the project already owns: the CLI leaves it alone, so the
		// preview component has to be added to it by hand.
		await mkdir(new URL("src/routes/", project), { recursive: true });
		await writeFile(
			new URL("src/routes/+layout.svelte", project),
			"<script>\n\tlet { children } = $props();\n</script>\n\n{@render children()}\n",
		);

		await agent(`Set up previews for this website.`);

		const layout = await readFile(new URL("src/routes/+layout.svelte", project), "utf8");
		expect(layout).toContain("PrismicPreview");
		expect(layout).toContain("@prismicio/svelte/kit");
	},
);
