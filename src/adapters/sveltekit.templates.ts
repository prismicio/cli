import type { DynamicCustomTypeModel } from "@prismicio/types-internal";
import { pascalCase } from "change-case";

import { dedent } from "../lib/string";

export function prismicIOFileTemplate({ typescript }: { typescript: boolean }): string {
	if (typescript) {
		return dedent`
			import { createClient as baseCreateClient } from "@prismicio/client";
			import { type CreateClientConfig, enableAutoPreviews } from '@prismicio/svelte/kit';
			import { PUBLIC_PRISMIC_ENVIRONMENT } from '$app/env/public';
			import prismicConfig from "../../prismic.config.json";

			/**
			 * The project's Prismic repository name.
			 */
			export const repositoryName =
				PUBLIC_PRISMIC_ENVIRONMENT || prismicConfig.repositoryName;

			/**
			 * Creates a Prismic client for the project's repository. The client is used to
			 * query content from the Prismic API.
			 *
			 * @param config - Configuration for the Prismic client.
			 */
			export const createClient = ({ cookies, ...config }: CreateClientConfig = {}) => {
				const client = baseCreateClient(repositoryName, {
					routes: prismicConfig.routes,
					...config,
				});

				enableAutoPreviews({ client, cookies });

				return client;
			};
		`;
	}

	return dedent`
		import { createClient as baseCreateClient } from "@prismicio/client";
		import { enableAutoPreviews } from '@prismicio/svelte/kit';
		import { PUBLIC_PRISMIC_ENVIRONMENT } from '$app/env/public';
		import prismicConfig from "../../prismic.config.json";

		/**
		 * The project's Prismic repository name.
		 */
		export const repositoryName =
			PUBLIC_PRISMIC_ENVIRONMENT || prismicConfig.repositoryName;

		/**
		 * Creates a Prismic client for the project's repository. The client is used to
		 * query content from the Prismic API.
		 *
		 * @param {import('@prismicio/svelte/kit').CreateClientConfig} config - Configuration for the Prismic client.
		 */
		export const createClient = ({ cookies, ...config } = {}) => {
			const client = baseCreateClient(repositoryName, {
				routes: prismicConfig.routes,
				...config,
			});

			enableAutoPreviews({ client, cookies });

			return client;
		};
	`;
}

export function envVarTemplate(): string {
	return dedent`
		PUBLIC_PRISMIC_ENVIRONMENT: {
			public: true,
			schema: (value) => value,
			description: "The Prismic environment to use instead of the production repository.",
		},
	`;
}

export function envFileTemplate(): string {
	return dedent`
		import { defineEnvVars } from "@sveltejs/kit/env";

		export const variables = defineEnvVars({
			${envVarTemplate()}
		});
	`;
}

export function sliceSimulatorPageTemplate({ typescript }: { typescript: boolean }): string {
	return dedent`
		<script>
			import { SliceSimulator, SliceZone } from '@prismicio/svelte';
			import { components } from '#lib/slices/index.${typescript ? "ts" : "js"}';
		</script>

		<SliceSimulator>
			{#snippet children({ slices })}
				<SliceZone {slices} {components} />
			{/snippet}
		</SliceSimulator>
	`;
}

export function previewAPIRouteTemplate({ typescript }: { typescript: boolean }): string {
	if (typescript) {
		return dedent`
			import { redirectToPreviewURL } from '@prismicio/svelte/kit';
			import { createClient } from '#lib/prismicio.ts';
			import type { RequestHandler } from "./$types";

			export const GET: RequestHandler = async ({ fetch, request, cookies }) => {
				const client = createClient({ fetch });

				return await redirectToPreviewURL({ client, request, cookies });
			}
		`;
	}

	return dedent`
		import { redirectToPreviewURL } from '@prismicio/svelte/kit';
		import { createClient } from '#lib/prismicio.js';

		/* @type {import("./$types").RequestHandler} */
		export async function GET({ fetch, request, cookies }) {
			const client = createClient({ fetch });

			return await redirectToPreviewURL({ client, request, cookies });
		}
	`;
}

export function layoutServerTemplate({ typescript }: { typescript: boolean }): string {
	return dedent`
		import { repositoryName } from "#lib/prismicio.${typescript ? "ts" : "js"}";

		export const prerender = "auto";

		export function load() {
			return { repositoryName };
		}
	`;
}

export function rootLayoutTemplate(): string {
	return dedent`
		<script>
			import { isFilled, asImageSrc } from '@prismicio/client';
			import { PrismicPreview } from '@prismicio/svelte/kit';
			import { page } from '$app/state';

			const { data, children } = $props();
		</script>

		<svelte:head>
			<title>{page.data.page?.data.meta_title}</title>
			<meta property="og:title" content={page.data.page?.data.meta_title} />
			{#if isFilled.keyText(page.data.page?.data.meta_description)}
				<meta name="description" content={page.data.page.data.meta_description} />
				<meta property="og:description" content={page.data.page.data.meta_description} />
			{/if}
			{#if isFilled.image(page.data.page?.data.meta_image)}
				<meta property="og:image" content={asImageSrc(page.data.page.data.meta_image)} />
			{/if}
		</svelte:head>
		{@render children()}
		<PrismicPreview repositoryName={data.repositoryName} />
	`;
}

export function pageTemplate({ typescript }: { typescript: boolean }): string {
	if (typescript) {
		return dedent`
			<script lang="ts">
				import { SliceZone } from "@prismicio/svelte";
				import { components } from "#lib/slices/index.ts";
				import type { PageProps } from "./$types";

				const { data }: PageProps = $props();
			</script>

			<SliceZone slices={data.page.data.slices} {components} />
		`;
	}

	return dedent`
		<script>
			import { SliceZone } from "@prismicio/svelte";
			import { components } from "#lib/slices/index.js";

			const { data } = $props();
		</script>

		<SliceZone slices={data.page.data.slices} {components} />
	`;
}

export function pageServerTemplate({
	model,
	typescript,
}: {
	model: DynamicCustomTypeModel;
	typescript: boolean;
}): string {
	if (model.repeatable) {
		if (typescript) {
			return dedent`
				import type { PageServerLoad } from "./$types";
				import { createClient } from "#lib/prismicio.ts";

				export const load: PageServerLoad = async ({ params, fetch, cookies }) => {
					const client = createClient({ fetch, cookies });
					const page = await client.getByUID("${model.id}", params.uid);

					return { page };
				};
			`;
		}

		return dedent`
			import { createClient } from "#lib/prismicio.js";

			/** @type {import("./$types").PageServerLoad} */
			export async function load({ params, fetch, cookies }) {
				const client = createClient({ fetch, cookies });
				const page = await client.getByUID("${model.id}", params.uid);

				return { page };
			}
		`;
	}

	if (typescript) {
		return dedent`
			import type { PageServerLoad } from "./$types";
			import { createClient } from "#lib/prismicio.ts";

			export const load: PageServerLoad = async ({ fetch, cookies }) => {
				const client = createClient({ fetch, cookies });
				const page = await client.getSingle("${model.id}");

				return { page };
			};
		`;
	}

	return dedent`
		import { createClient } from "#lib/prismicio.js";

		/* @type {import("./$types").PageServerLoad} */
		export async function load({ fetch, cookies }) {
			const client = createClient({ fetch, cookies });
			const page = await client.getSingle("${model.id}");

			return { page };
		}
	`;
}

const SLICE_MARKUP = dedent`
<section data-slice-type={slice.slice_type} data-slice-variation={slice.variation}>
	Placeholder component for {slice.slice_type} (variation: {slice.variation}) slices.
	<br />
	<strong>You can edit this slice directly in your code editor.</strong>
</section>
`;

export function sliceTemplate({ name, typescript }: { name: string; typescript: boolean }): string {
	const pascalName = pascalCase(name);

	if (typescript) {
		return dedent`
			<script lang="ts">
				import type { Content } from '@prismicio/client';
				import type { SliceComponentProps } from '@prismicio/svelte';

				type Props = SliceComponentProps<Content.${pascalName}Slice>;

				const { slice }: Props = $props();
			</script>

			${SLICE_MARKUP}
		`;
	}

	return dedent`
		<script>
			/* @typedef {import("@prismicio/client").Content} Content */
			/* @typedef {import("@prismicio/svelte").SliceComponentProps} SliceComponentProps */

			/* @type {SliceComponentProps<Content.${pascalName}Slice>} */
			const { slice } = $props();
		</script>

		${SLICE_MARKUP}
	`;
}
