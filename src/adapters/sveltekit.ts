import { readFile, rm } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { DynamicCustomTypeModel, SharedSliceModel } from "@prismicio/types-internal";
import { pascalCase } from "change-case";

import {
	Adapter,
	checkSourceContains,
	getJsFileExtension,
	type PageFile,
	writeFileIfMissing,
} from ".";
import { exists, writeFileRecursive } from "../lib/file";
import { addDependencies, getNpmPackageVersion } from "../lib/packageJson";
import { dedent, formatObjectKey } from "../lib/string";
import { checkIsTypeScriptProject, findProjectRoot } from "../project";
import {
	envFileTemplate,
	envVarTemplate,
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

		await writeFileIfMissing(
			new URL(`src/lib/prismicio.${extension}`, projectRoot),
			prismicIOFileTemplate({ typescript }),
		);
		if (!(await findSourceFile("src/env"))) {
			await writeFileRecursive(new URL(`src/env.${extension}`, projectRoot), envFileTemplate());
		}
		await writeFileIfMissing(
			new URL("src/routes/slice-simulator/+page.svelte", projectRoot),
			sliceSimulatorPageTemplate({ typescript }),
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
				layoutServerTemplate({ typescript }),
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
				rootLayoutTemplate(),
			);
		}
		await deleteStarterHomePage();
	}

	async getSetupInstructions(): Promise<string | undefined> {
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

		return (
			[await this.getEnvStep(), await this.getPreviewStep(), homePageStep]
				.filter(Boolean)
				.join("\n\n") || undefined
		);
	}

	// The generated Prismic client imports PUBLIC_PRISMIC_ENVIRONMENT, which SvelteKit only
	// provides when the project's env file declares it.
	private async getEnvStep(): Promise<string | undefined> {
		const envFile = await findSourceFile("src/env");
		if (!envFile) return;
		const contents = await readFile(new URL(envFile, await findProjectRoot()), "utf8");
		if (contents.includes("PUBLIC_PRISMIC_ENVIRONMENT")) return;

		return dedent`
			Action required: add PUBLIC_PRISMIC_ENVIRONMENT to ${envFile}.

			Your project does not build until you do this. Add these lines to
			defineEnvVars({ ... }):

			${envVarTemplate().replace(/^/gm, "  ")}
		`;
	}

	private async getPreviewStep(): Promise<string | undefined> {
		if (await checkSourceContains("PrismicPreview")) return;

		// The layout reads repositoryName from the server layout's data.
		const serverLayoutPath =
			(await findSourceFile("src/routes/+layout.server")) ??
			`src/routes/+layout.server.${await getJsFileExtension()}`;
		const serverLayout = await readFile(
			new URL(serverLayoutPath, await findProjectRoot()),
			"utf8",
		).catch(() => "");
		const serverLayoutStep =
			!serverLayout.includes("repositoryName") &&
			`Return repositoryName from load in ${serverLayoutPath}, creating the file if needed:\n\n${layoutServerTemplate({ typescript: serverLayoutPath.endsWith(".ts") }).replace(/^/gm, "  ")}`;

		return [
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
		});
		await writeFileRecursive(new URL("index.svelte", directory), contents);
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

async function deleteStarterHomePage(): Promise<void> {
	const path = new URL("src/routes/+page.svelte", await findProjectRoot());
	const contents = await readFile(path, "utf8").catch(() => undefined);
	if (!STARTER_HOME_PAGES.includes(contents?.replace(/\s/g, "") ?? "")) return;

	await rm(path);
}

// Finds a JavaScript or TypeScript file by its path without an extension.
async function findSourceFile(path: string): Promise<string | undefined> {
	const projectRoot = await findProjectRoot();
	for (const extension of ["js", "ts"]) {
		if (await exists(new URL(`${path}.${extension}`, projectRoot))) return `${path}.${extension}`;
	}
}
