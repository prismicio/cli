import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { pascalCase } from "change-case";

import { dedent } from "../lib/string";

export function prismicIOFileTemplate(args: { typescript: boolean }): string {
	const { typescript } = args;

	if (typescript) {
		return dedent`
			import { createClient as baseCreateClient } from "@prismicio/client";
			import { type CreateClientConfig, enableAutoPreviews } from '@prismicio/svelte/kit';
			import prismicConfig from "../../prismic.config.json";

			/**
			 * The project's Prismic repository name.
			 */
			export const repositoryName = prismicConfig.repositoryName;

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
		import prismicConfig from "../../prismic.config.json";

		/**
		 * The project's Prismic repository name.
		 */
		export const repositoryName = prismicConfig.repositoryName;

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

export function sliceSimulatorPageTemplate(args: { version: number }): string {
	const { version } = args;

	const v5 = dedent`
		<script>
			import { SliceSimulator, SliceZone } from '@prismicio/svelte';
			import { components } from '$lib/slices';
		</script>

		<!-- Slot syntax is used for backward compatibility with Svelte <=4. -->
		<SliceSimulator let:slices>
			<SliceZone {slices} {components} />
		</SliceSimulator>
	`;

	const v4 = dedent`
		<script>
			import { SliceSimulator, SliceZone } from '@prismicio/svelte';
			import { components } from '$lib/slices';
		</script>

		<SliceSimulator let:slices>
			<SliceZone {slices} {components} />
		</SliceSimulator>
	`;

	return version <= 4 ? v4 : v5;
}

export function previewAPIRouteTemplate(args: { typescript: boolean }): string {
	const { typescript } = args;

	if (typescript) {
		return dedent`
			import { redirectToPreviewURL } from '@prismicio/svelte/kit';
			import { createClient } from '$lib/prismicio';
			import type { RequestHandler } from "./$types";

			export const GET: RequestHandler = async ({ fetch, request, cookies }) => {
				const client = createClient({ fetch });

				return await redirectToPreviewURL({ client, request, cookies });
			}
		`;
	}

	return dedent`
		import { redirectToPreviewURL } from '@prismicio/svelte/kit';
		import { createClient } from '$lib/prismicio';

		/* @type {import("./$types").RequestHandler} */
		export async function GET({ fetch, request, cookies }) {
			const client = createClient({ fetch });

			return await redirectToPreviewURL({ client, request, cookies });
		}
	`;
}

export function rootLayoutTemplate(args: { version: number }): string {
	const { version } = args;

	const v5 = dedent`
		<script>
			import { isFilled, asImageSrc } from '@prismicio/client';
			import { PrismicPreview } from '@prismicio/svelte/kit';
			import { page } from '$app/state';
			import { repositoryName } from '$lib/prismicio';

			const { children } = $props();
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
		<PrismicPreview {repositoryName} />
	`;

	const v4 = dedent`
		<script>
			import { isFilled, asImageSrc } from '@prismicio/client';
			import { PrismicPreview } from '@prismicio/svelte/kit';
			import { page } from '$app/state';
			import { repositoryName } from '$lib/prismicio';
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
		<slot />
		<PrismicPreview {repositoryName} />
	`;

	return version <= 4 ? v4 : v5;
}

export function pageTemplate(args: { typescript: boolean }): string {
	const { typescript } = args;

	if (typescript) {
		return dedent`
			<script lang="ts">
				import { SliceZone } from "@prismicio/svelte";
				import { components } from "$lib/slices";
				import type { PageProps } from "./$types";

				const { data }: PageProps = $props();
			</script>

			<SliceZone slices={data.page.data.slices} {components} />
		`;
	}

	return dedent`
		<script>
			import { SliceZone } from "@prismicio/svelte";
			import { components } from "$lib/slices";

			const { data } = $props();
		</script>

		<SliceZone slices={data.page.data.slices} {components} />
	`;
}

export function pageServerTemplate(args: { model: CustomType; typescript: boolean }): string {
	const { model, typescript } = args;

	if (model.repeatable) {
		if (typescript) {
			return dedent`
				import type { PageServerLoad } from "./$types";
				import { createClient } from "$lib/prismicio";

				export const load: PageServerLoad = async ({ params, fetch, cookies }) => {
					const client = createClient({ fetch, cookies });
					const page = await client.getByUID("${model.id}", params.uid);

					return { page };
				};
			`;
		}

		return dedent`
			import { createClient } from "$lib/prismicio";

			/* @type {import("./$types").PageServerLoad} */
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
			import { createClient } from "$lib/prismicio";

			export const load: PageServerLoad = async ({ fetch, cookies }) => {
				const client = createClient({ fetch, cookies });
				const page = await client.getSingle("${model.id}");

				return { page };
			};
		`;
	}

	return dedent`
		import { createClient } from "$lib/prismicio";

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

export function sliceTemplate(args: {
	name: string;
	typescript: boolean;
	version: number;
}): string {
	const { name, typescript, version } = args;

	const pascalName = pascalCase(name);

	const v5TS = dedent`
		<script lang="ts">
			import type { Content } from '@prismicio/client';
			import type { SliceComponentProps } from '@prismicio/svelte';

			type Props = SliceComponentProps<Content.${pascalName}Slice>;

			const { slice }: Props = $props();
		</script>

		${SLICE_MARKUP}
	`;

	const v5JS = dedent`
		<script>
			/* @typedef {import("@prismicio/client").Content} Content */
			/* @typedef {import("@prismicio/svelte").SliceComponentProps} SliceComponentProps */

			/* @type {SliceComponentProps<Content.${pascalName}Slice>} */
			const { slice } = $props();
		</script>

		${SLICE_MARKUP}
	`;

	const v4TS = dedent`
		<script lang="ts">
			import type { Content } from '@prismicio/client';

			export let slice: Content.${pascalName}Slice;
		</script>

		${SLICE_MARKUP}
	`;

	const v4JS = dedent`
		<script>
			/** @type {import("@prismicio/client").Content.${pascalName}Slice} */
			export let slice;
		</script>

		${SLICE_MARKUP}
	`;

	if (typescript) {
		return version <= 4 ? v4TS : v5TS;
	}

	return version <= 4 ? v4JS : v5JS;
}
