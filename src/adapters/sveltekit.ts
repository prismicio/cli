import { readFile, rm } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { DynamicCustomTypeModel, SharedSliceModel } from "@prismicio/types-internal";
import { pascalCase } from "change-case";

import {
	Adapter,
	checkSourceContains,
	getInstalledMajor,
	getJsFileExtension,
	writeFileIfMissing,
} from ".";
import { exists, writeFileRecursive } from "../lib/file";
import { addDependencies, getNpmPackageVersion } from "../lib/packageJson";
import { dedent, formatObjectKey } from "../lib/string";
import { checkIsTypeScriptProject, findProjectRoot } from "../project";
import {
	layoutServerTemplate,
	pageServerTemplate,
	pageTemplate,
	previewAPIRouteTemplate,
	prismicIOFileTemplate,
	rootLayoutTemplate,
	sliceSimulatorPageTemplate,
	sliceTemplate,
} from "./sveltekit.templates";

// The home pages from `sv create` and the older `create-svelte`, with whitespace removed.
const STARTER_HOME_PAGES = [
	'<h1>WelcometoSvelteKit</h1><p>Visit<ahref="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a>toreadthedocumentation</p>',
	'<h1>WelcometoSvelteKit</h1><p>Visit<ahref="https://kit.svelte.dev">kit.svelte.dev</a>toreadthedocumentation</p>',
];

export class SvelteKitAdapter extends Adapter {
	readonly id = "sveltekit";

	readonly environmentEnvVarName = "PUBLIC_PRISMIC_ENVIRONMENT";

	readonly localPreviewConfig = {
		name: "Development",
		websiteURL: "http://localhost:5173",
		resolverPath: "/api/preview",
	};

	async setupProject(): Promise<void> {
		await addDependencies({
			"@prismicio/client": `^${await getNpmPackageVersion("@prismicio/client")}`,
			"@prismicio/svelte": `^${await getNpmPackageVersion("@prismicio/svelte")}`,
		});

		const projectRoot = await findProjectRoot();
		const extension = await getJsFileExtension();
		const typescript = await checkIsTypeScriptProject();
		const version = await getInstalledMajor("svelte");

		await writeFileIfMissing(
			new URL(`src/lib/prismicio.${extension}`, projectRoot),
			prismicIOFileTemplate({ typescript }),
		);
		await writeFileIfMissing(
			new URL("src/routes/slice-simulator/+page.svelte", projectRoot),
			sliceSimulatorPageTemplate({ version }),
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
		if (!(await findServerLayout())) {
			await writeFileRecursive(
				new URL(`src/routes/+layout.server.${extension}`, projectRoot),
				layoutServerTemplate(),
			);
		}
		await writeFileIfMissing(
			new URL("src/routes/+layout.svelte", projectRoot),
			rootLayoutTemplate({ version }),
		);
		await deleteStarterHomePage();
	}

	async getPreviewComponentInstructions(): Promise<string | undefined> {
		const projectRoot = await findProjectRoot();
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

		return [await this.getPreviewStep(), homePageStep].filter(Boolean).join("\n\n") || undefined;
	}

	private async getPreviewStep(): Promise<string | undefined> {
		if (await checkSourceContains("PrismicPreview")) return;

		const layoutStep =
			(await getInstalledMajor("svelte")) <= 4
				? dedent`
					Add the lines marked + to src/routes/+layout.svelte:

					  <script>
					+   import { PrismicPreview } from "@prismicio/svelte/kit";
					+
					+   export let data;
					  </script>

					  <slot />
					+ <PrismicPreview repositoryName={data.repositoryName} />
				`
				: dedent`
					Change the lines marked - and + in src/routes/+layout.svelte:

					  <script>
					+   import { PrismicPreview } from "@prismicio/svelte/kit";

					-   let { children } = $props();
					+   let { data, children } = $props();
					  </script>

					  {@render children()}
					+ <PrismicPreview repositoryName={data.repositoryName} />
				`;

		// The layout reads repositoryName from the server layout's data.
		const serverLayoutPath =
			(await findServerLayout()) ?? `src/routes/+layout.server.${await getJsFileExtension()}`;
		const serverLayout = await readFile(
			new URL(serverLayoutPath, await findProjectRoot()),
			"utf8",
		).catch(() => "");
		const serverLayoutStep =
			!serverLayout.includes("repositoryName") &&
			`Return repositoryName from load in ${serverLayoutPath}, creating the file if needed:\n\n${layoutServerTemplate().replace(/^/gm, "  ")}`;

		return [
			dedent`
				Action required: add <PrismicPreview> to your root layout.

				Previews do not work until you do this, and the CLI cannot edit your
				layout for you. Make the change now.
			`,
			layoutStep,
			serverLayoutStep,
			"Run `prismic docs view sveltekit` for details.",
		]
			.filter(Boolean)
			.join("\n\n");
	}

	async createSliceIndexFile(library: URL): Promise<void> {
		const slices = (await this.getSlices()).filter((slice) => slice.library.href === library.href);
		const imports = slices.map((slice) => {
			const relativeDirectory = relative(fileURLToPath(library), fileURLToPath(slice.directory));
			return `import ${pascalCase(slice.model.name)} from "./${relativeDirectory}/index.svelte";`;
		});
		const componentLines = slices.map(
			(slice) => `${formatObjectKey(slice.model.id)}: ${pascalCase(slice.model.name)}`,
		);
		const contents = dedent`
			// Code generated by Prismic. DO NOT EDIT.

			${imports.join("\n")}

			export const components = {
				${componentLines.join(",\n")}
			};
		`;
		await writeFileRecursive(new URL(`index.${await getJsFileExtension()}`, library), contents);
	}

	protected async getDefaultSliceLibrary(): Promise<URL> {
		return new URL("src/lib/slices/", await findProjectRoot());
	}

	protected async createSliceComponent(model: SharedSliceModel, directory: URL): Promise<void> {
		const contents = sliceTemplate({
			name: model.name,
			typescript: await checkIsTypeScriptProject(),
			version: await getInstalledMajor("svelte"),
		});
		await writeFileRecursive(new URL("index.svelte", directory), contents);
	}

	protected async createPageFile(model: DynamicCustomTypeModel, routePath: string): Promise<void> {
		const routeDirectory = new URL(
			`src/routes/[[preview=preview]]/${routePath}/`,
			await findProjectRoot(),
		);
		const typescript = await checkIsTypeScriptProject();
		await writeFileIfMissing(new URL("+page.svelte", routeDirectory), pageTemplate({ typescript }));
		await writeFileIfMissing(
			new URL(`+page.server.${await getJsFileExtension()}`, routeDirectory),
			pageServerTemplate({ model, typescript }),
		);
	}
}

async function deleteStarterHomePage(): Promise<void> {
	const path = new URL("src/routes/+page.svelte", await findProjectRoot());
	const contents = await readFile(path, "utf8").catch(() => undefined);
	if (!STARTER_HOME_PAGES.includes(contents?.replace(/\s/g, "") ?? "")) return;

	await rm(path);
}

async function findServerLayout(): Promise<string | undefined> {
	const projectRoot = await findProjectRoot();
	for (const path of ["src/routes/+layout.server.js", "src/routes/+layout.server.ts"]) {
		if (await exists(new URL(path, projectRoot))) return path;
	}
}
