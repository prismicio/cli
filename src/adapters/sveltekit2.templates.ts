import type { DynamicCustomTypeModel } from "@prismicio/types-internal";

import { dedent } from "../lib/string";
import * as sveltekit from "./sveltekit.templates";

// SvelteKit 2 has no #lib, so it imports from $lib without file extensions.
function useLib(code: string): string {
	return code.replace(/#lib\/(\w+)(?:\/index)?\.\w+/g, "$lib/$1");
}

// SvelteKit 2 has no $app/env.
export function prismicIOFileTemplate({ typescript }: { typescript: boolean }): string {
	return sveltekit
		.prismicIOFileTemplate({ typescript })
		.replace(
			"{ PUBLIC_PRISMIC_ENVIRONMENT } from '$app/env/public'",
			"{ env } from '$env/dynamic/public'",
		)
		.replace("PUBLIC_PRISMIC_ENVIRONMENT ||", "env.PUBLIC_PRISMIC_ENVIRONMENT ||");
}

// @prismicio/svelte v2 passes slices through a slot.
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
	return useLib(sveltekit.previewAPIRouteTemplate({ typescript }));
}

// @prismicio/svelte v2's <PrismicPreview> has no previewURL prop.
export function rootLayoutTemplate(): string {
	return sveltekit.rootLayoutTemplate({ previewURL: "" }).replace(' previewURL=""', "");
}

export function layoutServerTemplate(): string {
	return useLib(sveltekit.layoutServerTemplate({ extension: "js" }));
}

export function pageTemplate({ typescript }: { typescript: boolean }): string {
	return useLib(sveltekit.pageTemplate({ typescript }));
}

export function pageServerTemplate({
	model,
	typescript,
}: {
	model: DynamicCustomTypeModel;
	typescript: boolean;
}): string {
	return useLib(sveltekit.pageServerTemplate({ model, typescript }));
}
