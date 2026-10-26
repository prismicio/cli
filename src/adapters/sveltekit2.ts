import { readFile } from "node:fs/promises";

import type { DynamicCustomTypeModel } from "@prismicio/types-internal";

import { checkSourceContains, getJsFileExtension, type PageFile, writeFileIfMissing } from ".";
import { exists, writeFileRecursive } from "../lib/file";
import { addDependencies, getNpmPackageVersion } from "../lib/packageJson";
import { dedent } from "../lib/string";
import { checkIsTypeScriptProject, findProjectRoot } from "../project";
import { deleteStarterHomePage, findSourceFile, SvelteKitAdapter } from "./sveltekit";
import { rootLayoutTemplate } from "./sveltekit.templates";
import {
	layoutServerTemplate,
	pageServerTemplate,
	pageTemplate,
	previewAPIRouteTemplate,
	prismicIOFileTemplate,
	sliceSimulatorPageTemplate,
} from "./sveltekit2.templates";

// SvelteKit 2 projects use @prismicio/svelte v2. Delete this file and sveltekit2.templates.ts
// when SvelteKit 2 support ends.
export class SvelteKit2Adapter extends SvelteKitAdapter {
	async setupProject(): Promise<void> {
		await addDependencies({
			"@prismicio/client": `^${await getNpmPackageVersion("@prismicio/client")}`,
			"@prismicio/svelte": "^2",
		});

		const projectRoot = await findProjectRoot();
		const extension = await getJsFileExtension();
		const typescript = await checkIsTypeScriptProject();

		await writeFileIfMissing(
			new URL(`src/lib/prismicio.${extension}`, projectRoot),
			prismicIOFileTemplate({ typescript }),
		);
		await writeFileIfMissing(
			new URL("src/routes/slice-simulator/+page.svelte", projectRoot),
			sliceSimulatorPageTemplate(),
		);
		await writeFileIfMissing(
			new URL(`src/params/preview.${extension}`, projectRoot),
			dedent`
				export function match(param) {
					return param === 'preview';
				}
			`,
		);
		await writeFileIfMissing(
			new URL(`src/routes/api/preview/+server.${extension}`, projectRoot),
			previewAPIRouteTemplate({ typescript }),
		);
		await writeFileIfMissing(
			new URL("src/routes/[[preview=preview]]/README.md", projectRoot),
			dedent`
				This directory adds support for optional \`/preview\` routes. Do not remove this directory.

				All routes within this directory will be served using the following URLs:

				- \`/example-route\` (prerendered)
				- \`/preview/example-route\` (server-rendered)

				See <https://prismic.io/docs/svelte-preview> for more information.
			`,
		);
		const serverLayout = await findSourceFile("src/routes/+layout.server");
		if (!serverLayout) {
			await writeFileRecursive(
				new URL(`src/routes/+layout.server.${extension}`, projectRoot),
				layoutServerTemplate(),
			);
		}
		// The generated layout reads repositoryName from the server layout. When an existing
		// server layout does not return it, the setup instructions cover both files instead.
		const returnsRepositoryName =
			!serverLayout ||
			(await readFile(new URL(serverLayout, projectRoot), "utf8")).includes("repositoryName");
		if (returnsRepositoryName) {
			await writeFileIfMissing(
				new URL("src/routes/+layout.svelte", projectRoot),
				// @prismicio/svelte v2's <PrismicPreview> has no previewURL prop.
				rootLayoutTemplate(),
			);
		}
		await deleteStarterHomePage();
	}

	async getSetupInstructions(): Promise<string | undefined> {
		const projectRoot = await findProjectRoot();

		// The layout reads repositoryName from the server layout's data.
		const serverLayoutPath =
			(await findSourceFile("src/routes/+layout.server")) ??
			`src/routes/+layout.server.${await getJsFileExtension()}`;
		const serverLayout = await readFile(new URL(serverLayoutPath, projectRoot), "utf8").catch(
			() => "",
		);
		const previewStep =
			!(await checkSourceContains("PrismicPreview")) &&
			[
				dedent`
					Action required: add <PrismicPreview> to your root layout.

					Previews do not work until you do this, and the CLI cannot edit your
					layout for you. Make the change now.

					Change the lines marked - and + in src/routes/+layout.svelte:

					  <script>
					+   import { PrismicPreview } from "@prismicio/svelte/kit";

					-   let { children } = $props();
					+   let { data, children } = $props();
					  </script>

					  {@render children()}
					+ <PrismicPreview repositoryName={data.repositoryName} />
				`,
				!serverLayout.includes("repositoryName") &&
					`Return repositoryName from load in ${serverLayoutPath}, creating the file if needed:\n\n${layoutServerTemplate().replace(/^/gm, "  ")}`,
				"Run `prismic docs view sveltekit` for details.",
			]
				.filter(Boolean)
				.join("\n\n");

		// The Prismic home page lives in [[preview=preview]], so this page also serves / and wins.
		const hidesHomePage =
			(await exists(new URL("src/routes/+page.svelte", projectRoot))) &&
			(await exists(new URL("src/routes/[[preview=preview]]/+page.svelte", projectRoot)));
		const homePageStep =
			hidesHomePage &&
			dedent`
				Action required: delete src/routes/+page.svelte.

				It also serves / and hides your Prismic home page in
				src/routes/[[preview=preview]]/+page.svelte. Move anything you need
				from it first.
			`;

		return [previewStep, homePageStep].filter(Boolean).join("\n\n") || undefined;
	}

	protected async getPageFiles(
		model: DynamicCustomTypeModel,
		routePath: string,
	): Promise<PageFile[]> {
		const routeDirectory = new URL(
			`src/routes/[[preview=preview]]/${routePath}/`,
			await findProjectRoot(),
		);
		const typescript = await checkIsTypeScriptProject();
		return [
			{ path: new URL("+page.svelte", routeDirectory), contents: pageTemplate({ typescript }) },
			{
				path: new URL(`+page.server.${await getJsFileExtension()}`, routeDirectory),
				contents: pageServerTemplate({ model, typescript }),
			},
		];
	}
}
