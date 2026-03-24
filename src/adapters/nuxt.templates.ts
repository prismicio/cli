import type { CustomType } from "@prismicio/types-internal/lib/customtypes";

import { pascalCase } from "change-case";

import { dedent } from "../lib/string";

export function sliceTemplate(args: { name: string; typescript: boolean }): string {
	const { name, typescript } = args;

	const pascalName = pascalCase(name);

	if (typescript) {
		return dedent`
			<script setup lang="ts">
			import type { Content } from "@prismicio/client";

			// The array passed to \`getSliceComponentProps\` is purely optional.
			// Consider it as a visual hint for you when templating your slice.
			defineProps(getSliceComponentProps<Content.${pascalName}Slice>(
				["slice", "index", "slices", "context"]
			));
			</script>

			<template>
				<section
					:data-slice-type="slice.slice_type"
					:data-slice-variation="slice.variation"
				>
					Placeholder component for {{ slice.slice_type }} (variation: {{ slice.variation }}) slices.
					<br />
					<strong>You can edit this slice directly in your code editor.</strong>
				</section>
			</template>
		`;
	}

	return dedent`
		<script setup>
		// The array passed to \`getSliceComponentProps\` is purely optional.
		// Consider it as a visual hint for you when templating your slice.
		defineProps(getSliceComponentProps(["slice", "index", "slices", "context"]));
		</script>

		<template>
			<section
				:data-slice-type="slice.slice_type"
				:data-slice-variation="slice.variation"
			>
				Placeholder component for {{ slice.slice_type }} (variation: {{ slice.variation }}) slices.
				<br />
				<strong>You can edit this slice directly in your code editor.</strong>
			</section>
		</template>
	`;
}

export function pageTemplate(args: { model: CustomType; typescript: boolean }): string {
	const { model, typescript } = args;

	const scriptAttributes = ["setup"];
	if (typescript) scriptAttributes.push('lang="ts"');

	if (model.repeatable) {
		return dedent`
			<script ${scriptAttributes.join(" ")}>
			import { components } from "~/slices";

			const prismic = usePrismic();
			const route = useRoute();
			const { data: page } = await useAsyncData(route.params.uid as string, () =>
				prismic.client.getByUID("${model.id}", route.params.uid as string),
			);
			</script>

			<template>
				<main>
					<SliceZone :slices="page?.data.slices ?? []" :components="components" />
				</main>
			</template>
		`;
	}

	return dedent`
		<script ${scriptAttributes.join(" ")}>
		import { components } from "~/slices";

		const prismic = usePrismic();
		const { data: page } = await useAsyncData("${model.id}", () =>
			prismic.client.getSingle("${model.id}"),
		);
		</script>

		<template>
			<main>
				<SliceZone :slices="page?.data.slices ?? []" :components="components" />
			</main>
		</template>
	`;
}

export function sliceSimulatorPageTemplate(args: { typescript: boolean }): string {
	const { typescript } = args;

	const scriptAttributes = ["setup"];
	if (typescript) {
		scriptAttributes.push('lang="ts"');
	}

	return dedent`
		<script ${scriptAttributes.join(" ")}>
		import { components } from "~/slices";
		</script>

		<template>
			<SliceSimulator #default="{ slices }">
				<SliceZone :slices="slices" :components="components" />
			</SliceSimulator>
		</template>
	`;
}
