import type { DynamicCustomTypeModel } from "@prismicio/types-internal";
import { pascalCase } from "change-case";

import { dedent } from "../lib/string";

const SLICE_MARKUP = dedent`
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

export function sliceTemplate({ name, typescript }: { name: string; typescript: boolean }): string {
	if (typescript) {
		return dedent`
			<script setup lang="ts">
			import type { Content } from "@prismicio/client";

			// The array passed to \`getSliceComponentProps\` is purely optional.
			// Consider it as a visual hint for you when templating your slice.
			defineProps(getSliceComponentProps<Content.${pascalCase(name)}Slice>(
				["slice", "index", "slices", "context"]
			));
			</script>

			${SLICE_MARKUP}
		`;
	}

	return dedent`
		<script setup>
		// The array passed to \`getSliceComponentProps\` is purely optional.
		// Consider it as a visual hint for you when templating your slice.
		defineProps(getSliceComponentProps(["slice", "index", "slices", "context"]));
		</script>

		${SLICE_MARKUP}
	`;
}

export function pageTemplate({
	model,
	typescript,
}: {
	model: DynamicCustomTypeModel;
	typescript: boolean;
}): string {
	const scriptAttributes = typescript ? 'setup lang="ts"' : "setup";

	if (model.repeatable) {
		const uidExpression = typescript ? "route.params.uid as string" : "route.params.uid";

		return dedent`
			<script ${scriptAttributes}>
			import { components } from "~/slices";

			const prismic = usePrismic();
			const route = useRoute();
			const { data: page } = await useAsyncData(${uidExpression}, () =>
				prismic.client.getByUID("${model.id}", ${uidExpression}),
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
		<script ${scriptAttributes}>
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

export function sliceSimulatorPageTemplate({ typescript }: { typescript: boolean }): string {
	const scriptAttributes = typescript ? 'setup lang="ts"' : "setup";

	return dedent`
		<script ${scriptAttributes}>
		import { components } from "~/slices";
		</script>

		<template>
			<SliceSimulator #default="{ slices }">
				<SliceZone :slices="slices" :components="components" />
			</SliceSimulator>
		</template>
	`;
}
