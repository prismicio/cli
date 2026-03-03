import { stripIndent } from "common-tags";

import type { PageTypeModel } from "./pageType";

export type PageComponentEnv = {
	hasAppRouter: boolean;
	isTypeScript: boolean;
	importPath: string;
	slicesPath: string;
};

export function generatePageComponent(
	model: PageTypeModel,
	env: PageComponentEnv,
): string {
	return env.hasAppRouter
		? generateAppRouterPage(model, env)
		: generatePagesRouterPage(model, env);
}

function generateAppRouterPage(
	model: PageTypeModel,
	env: PageComponentEnv,
): string {
	const { id, repeatable } = model;
	const { isTypeScript, importPath, slicesPath } = env;

	const imports = buildAppRouterImports(isTypeScript, importPath, slicesPath);
	const types =
		isTypeScript && repeatable ? "\ntype Params = { uid: string };\n" : "";
	const pageComponent = buildAppRouterPageComponent(
		id,
		repeatable,
		isTypeScript,
	);
	const metadata = buildAppRouterMetadata(id, repeatable, isTypeScript);
	const staticParams = repeatable ? buildAppRouterStaticParams(id) : "";

	return stripIndent`
		${imports}
		${types}
		${pageComponent}

		${metadata}
		${staticParams}
	`.trim();
}

function buildAppRouterImports(
	isTypeScript: boolean,
	importPath: string,
	slicesPath: string,
): string {
	const typeImport = isTypeScript
		? 'import type { Metadata } from "next";\n'
		: "";

	return stripIndent`
		${typeImport}import { notFound } from "next/navigation";
		import { asImageSrc } from "@prismicio/client";
		import { SliceZone } from "@prismicio/react";

		import { createClient } from "${importPath}";
		import { components } from "${slicesPath}";
	`;
}

function buildAppRouterPageComponent(
	typeId: string,
	repeatable: boolean | undefined,
	isTypeScript: boolean,
): string {
	if (repeatable) {
		const paramsType = isTypeScript ? ": { params: Promise<Params> }" : "";

		return stripIndent`
			export default async function Page({ params }${paramsType}) {
				const { uid } = await params;
				const client = createClient();
				const page = await client
					.getByUID("${typeId}", uid)
					.catch(() => notFound());

				return <SliceZone slices={page.data.slices} components={components} />;
			}
		`;
	}

	return stripIndent`
		export default async function Page() {
			const client = createClient();
			const page = await client.getSingle("${typeId}").catch(() => notFound());

			return <SliceZone slices={page.data.slices} components={components} />;
		}
	`;
}

function buildAppRouterMetadata(
	typeId: string,
	repeatable: boolean | undefined,
	isTypeScript: boolean,
): string {
	const returnType = isTypeScript ? ": Promise<Metadata>" : "";

	if (repeatable) {
		const paramsType = isTypeScript ? ":\n\t{ params: Promise<Params> }" : "";

		return stripIndent`
			export async function generateMetadata({
				params,
			}${paramsType})${returnType} {
				const { uid } = await params;
				const client = createClient();
				const page = await client
					.getByUID("${typeId}", uid)
					.catch(() => notFound());

				return {
					title: page.data.meta_title,
					description: page.data.meta_description,
					openGraph: {
						images: [{ url: asImageSrc(page.data.meta_image) ?? "" }],
					},
				};
			}
		`;
	}

	return stripIndent`
		export async function generateMetadata()${returnType} {
			const client = createClient();
			const page = await client.getSingle("${typeId}").catch(() => notFound());

			return {
				title: page.data.meta_title,
				description: page.data.meta_description,
				openGraph: {
					images: [{ url: asImageSrc(page.data.meta_image) ?? "" }],
				},
			};
		}
	`;
}

function buildAppRouterStaticParams(typeId: string): string {
	return stripIndent`

		export async function generateStaticParams() {
			const client = createClient();
			const pages = await client.getAllByType("${typeId}");

			return pages.map((page) => ({ uid: page.uid }));
		}
	`;
}

function generatePagesRouterPage(
	model: PageTypeModel,
	env: PageComponentEnv,
): string {
	const { id, repeatable } = model;
	const { isTypeScript, importPath, slicesPath } = env;

	const imports = buildPagesRouterImports(
		isTypeScript,
		importPath,
		slicesPath,
		repeatable,
	);
	const types =
		isTypeScript && repeatable ? "\ntype Params = { uid: string };\n" : "";
	const pageComponent = buildPagesRouterPageComponent(isTypeScript);
	const getStaticProps = buildGetStaticProps(id, repeatable, isTypeScript);
	const getStaticPaths = repeatable ? buildGetStaticPaths(id) : "";

	return stripIndent`
		${imports}
		${types}
		${pageComponent}

		${getStaticProps}
		${getStaticPaths}
	`.trim();
}

function buildPagesRouterImports(
	isTypeScript: boolean,
	importPath: string,
	slicesPath: string,
	repeatable: boolean | undefined,
): string {
	const typeImports = isTypeScript
		? `import type { GetStaticPropsContext, InferGetStaticPropsType } from "next";\n`
		: "";
	const clientImports = repeatable
		? 'import { isFilled, asLink, asImageSrc } from "@prismicio/client";'
		: 'import { isFilled, asImageSrc } from "@prismicio/client";';

	return stripIndent`
		${typeImports}import Head from "next/head";
		${clientImports}
		import { SliceZone } from "@prismicio/react";

		import { components } from "${slicesPath}";
		import { createClient } from "${importPath}";
	`;
}

function buildPagesRouterPageComponent(isTypeScript: boolean): string {
	const propsType = isTypeScript
		? ":\n\tInferGetStaticPropsType<typeof getStaticProps>"
		: "";

	return stripIndent`
		export default function Page({
			page,
		}${propsType}) {
			return (
				<>
					<Head>
						<title>{page.data.meta_title}</title>
						{isFilled.keyText(page.data.meta_description) ? (
							<meta name="description" content={page.data.meta_description} />
						) : null}
						{isFilled.image(page.data.meta_image) ? (
							<meta property="og:image" content={asImageSrc(page.data.meta_image) || ""} />
						) : null}
					</Head>
					<SliceZone slices={page.data.slices} components={components} />
				</>
			);
		}
	`;
}

function buildGetStaticProps(
	typeId: string,
	repeatable: boolean | undefined,
	isTypeScript: boolean,
): string {
	if (repeatable) {
		const paramsType = isTypeScript ? ":\n\tGetStaticPropsContext<Params>" : "";

		return stripIndent`
			export async function getStaticProps({
				params,
				previewData,
			}${paramsType}) {
				const client = createClient({ previewData });
				const page = await client.getByUID("${typeId}", params${isTypeScript ? "!" : ""}.uid);

				return { props: { page } };
			}
		`;
	}

	const paramsType = isTypeScript ? ": GetStaticPropsContext" : "";

	return stripIndent`
		export async function getStaticProps({ previewData }${paramsType}) {
			const client = createClient({ previewData });
			const page = await client.getSingle("${typeId}");

			return { props: { page } };
		}
	`;
}

function buildGetStaticPaths(typeId: string): string {
	return stripIndent`

		export async function getStaticPaths() {
			const client = createClient();
			const pages = await client.getAllByType("${typeId}");

			return {
				paths: pages.map((page) => asLink(page)),
				fallback: false,
			};
		}
	`;
}
