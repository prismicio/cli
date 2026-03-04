import type { PluginSystemContext } from "@prismicio/plugin-kit";
import { upsertGlobalTypeScriptTypes } from "@prismicio/plugin-kit/fs";

import type { PluginOptions } from "../types";

import {
	createPageTypeRouteFileIfMissing,
	isPageType,
	type PageTypeModel,
	upsertPrismicioRoutesConfig,
} from "./pageType";

/**
 * Syncs page type files after a custom type is created/updated/renamed.
 *
 * - Creates a page file if missing (for page types only)
 * - Updates the routes config in prismicio.ts (for page types only)
 * - Regenerates TypeScript types (always)
 */
export const syncPageTypeFiles = async (
	model: PageTypeModel,
	context: PluginSystemContext<PluginOptions>,
): Promise<void> => {
	const typesPromise = upsertGlobalTypeScriptTypes({
		filename: context.options.generatedTypesFilePath,
		format: context.options.format,
		...context,
	});

	if (isPageType(model)) {
		await Promise.all([
			createPageTypeRouteFileIfMissing(model, context),
			upsertPrismicioRoutesConfig(context),
			typesPromise,
		]);
	} else {
		await typesPromise;
	}
};
