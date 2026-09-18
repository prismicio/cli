import { readdir, readFile, writeFile } from "node:fs/promises";

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
