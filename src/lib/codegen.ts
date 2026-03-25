import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { writeFile } from "node:fs/promises";
import { generateTypes } from "prismic-ts-codegen";

export async function generateAndWriteTypes(args: {
	customTypes: CustomType[];
	slices: SharedSlice[];
	output: URL;
}): Promise<void> {
	const { customTypes, slices, output } = args;

	const types = generateTypes({
		customTypeModels: customTypes,
		sharedSliceModels: slices,
		clientIntegration: {
			includeContentNamespace: true,
			includeCreateClientInterface: true,
		},
		cache: true,
		typesProvider: "@prismicio/client",
	});
	await writeFile(output, types);
}
