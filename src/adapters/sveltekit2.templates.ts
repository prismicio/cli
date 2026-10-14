import type { DynamicCustomTypeModel } from "@prismicio/types-internal";

import { dedent } from "../lib/string";

// Templates for SvelteKit 2 projects, which use @prismicio/svelte v2, $lib, and
// $env/dynamic/public. The other templates are shared with SvelteKit 3.

export function prismicIOFileTemplate({ typescript }: { typescript: boolean }): string {
	if (typescript) {
		return dedent`
			import { createClient as baseCreateClient } from "@prismicio/client";
			import { type CreateClientConfig, enableAutoPreviews } from '@prismicio/svelte/kit';
			import { env } from '$env/dynamic/public';
			import prismicConfig from "../../prismic.config.json";

			/**
			 * The project's Prismic repository name.
			 */
			export const repositoryName =
				env.PUBLIC_PRISMIC_ENVIRONMENT || prismicConfig.repositoryName;

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
		import { env } from '$env/dynamic/public';
		import prismicConfig from "../../prismic.config.json";

		/**
		 * The project's Prismic repository name.
		 */
		export const repositoryName =
			env.PUBLIC_PRISMIC_ENVIRONMENT || prismicConfig.repositoryName;

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

export function sliceSimulatorPageTemplate(): string {
	return dedent`
		<script>
			import { SliceSimulator, SliceZone } from '@prismicio/svelte';
			import { components } from '$lib/slices';
		</script>

		<SliceSimulator let:slices>
			<SliceZone {slices} {components} />
		</SliceSimulator>
	`;
}

export function previewAPIRouteTemplate({ typescript }: { typescript: boolean }): string {
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

export function layoutServerTemplate(): string {
	return dedent`
		import { repositoryName } from "$lib/prismicio";

		export const prerender = "auto";

		export function load() {
			return { repositoryName };
		}
	`;
}

export function pageTemplate({ typescript }: { typescript: boolean }): string {
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
