import type { CustomType, SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { writeFile } from "node:fs/promises";
import { generateTypes } from "prismic-ts-codegen";

export async function generateAndWriteTypes(args: {
	customTypes: CustomType[];
	slices: SharedSlice[];
	projectRoot: URL;
}): Promise<void> {
	const types = generateTypes({
		customTypeModels: args.customTypes,
		sharedSliceModels: args.slices,
		clientIntegration: {
			includeContentNamespace: true,
			includeCreateClientInterface: true,
		},
		cache: true,
		typesProvider: "@prismicio/client",
	});
	const outputPath = new URL("prismicio-types.d.ts", args.projectRoot);
	await writeFile(outputPath, types);
}
