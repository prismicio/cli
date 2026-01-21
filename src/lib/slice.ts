import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { readdir, readFile } from "node:fs/promises";
import * as v from "valibot";

import { exists, findUpward } from "./file";

export const SharedSliceSchema = v.object({
	id: v.string(),
	type: v.literal("SharedSlice"),
	name: v.string(),
	description: v.optional(v.string()),
	variations: v.array(
		v.object({
			id: v.string(),
			name: v.string(),
			description: v.optional(v.string()),
			docURL: v.optional(v.string()),
			version: v.optional(v.string()),
			imageUrl: v.optional(v.string()),
			primary: v.optional(v.record(v.string(), v.unknown())),
			items: v.optional(v.record(v.string(), v.unknown())),
		}),
	),
});

type SliceModelResult =
	| { ok: true; model: SharedSlice; modelPath: URL }
	| { ok: false; error: string };

export async function findSliceModel(sliceId: string): Promise<SliceModelResult> {
	const projectRoot = await findUpward("package.json");
	if (!projectRoot) {
		return { ok: false, error: "Could not find project root (no package.json found)" };
	}

	const slicesDirectory = await getSlicesDirectory();

	// List all directories in slices folder
	let entries: string[];
	try {
		entries = await readdir(slicesDirectory, { withFileTypes: false }) as unknown as string[];
	} catch {
		return { ok: false, error: `No slices directory found at ${slicesDirectory.href}` };
	}

	// Search for a slice with matching ID
	for (const entry of entries) {
		const modelPath = new URL(`${entry}/model.json`, slicesDirectory);
		try {
			const contents = await readFile(modelPath, "utf8");
			const parsed = JSON.parse(contents);
			if (parsed.id === sliceId) {
				const result = v.safeParse(SharedSliceSchema, parsed);
				if (!result.success) {
					return { ok: false, error: `Invalid slice model at ${modelPath.href}` };
				}
				return { ok: true, model: result.output as SharedSlice, modelPath };
			}
		} catch {
			// Skip directories without valid model.json
		}
	}

	return { ok: false, error: `Slice not found: ${sliceId}\n\nCreate it first with: prismic slice create ${sliceId}` };
}

export async function getSlicesDirectory(): Promise<URL> {
	const framework = await detectFramework();
	const projectRoot = await findUpward("package.json");
	if (!projectRoot) {
		throw new Error("Could not find project root (no package.json found)");
	}
	const projectDir = new URL(".", projectRoot);

	switch (framework) {
		case "next": {
			const hasSrcDir = await exists(new URL("src", projectDir));
			if (hasSrcDir) return new URL("src/slices/", projectDir);
		}
		case "nuxt": {
			const hasAppDir = await exists(new URL("app", projectDir));
			if (hasAppDir) return new URL("app/slices/", projectDir);
		}
		case "sveltekit": {
			return new URL("src/slices/", projectDir);
		}
	}
	return new URL("slices/", projectDir);
}

const PackageJsonSchema = v.object({
	dependencies: v.optional(v.record(v.string(), v.string())),
});

type Framework = "next" | "nuxt" | "sveltekit";

async function detectFramework(): Promise<Framework | undefined> {
	const packageJsonPath = await findUpward("package.json");
	if (!packageJsonPath) return;
	try {
		const contents = await readFile(packageJsonPath, "utf8");
		const { dependencies = {} } = v.parse(PackageJsonSchema, JSON.parse(contents));
		if ("next" in dependencies) return "next";
		if ("nuxt" in dependencies) return "nuxt";
		if ("@sveltejs/kit" in dependencies) return "sveltekit";
	} catch {}
}

export function pascalCase(input: string): string {
	return input.toLowerCase().replace(/(^|[-_\s]+)(.)?/g, (_, __, c) => c?.toUpperCase() ?? "");
}
