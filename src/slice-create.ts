import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { exists, findUpward } from "./lib/file";
import { stringify } from "./lib/json";

const HELP = `
Create a new slice in a Prismic project.

USAGE
  prismic slice create <id> [flags]

ARGUMENTS
  id       Slice identifier (required)

FLAGS
  -n, --name string   Display name for the slice
  -h, --help          Show help for command

LEARN MORE
  Use \`prismic slice <command> --help\` for more information about a command.
`.trim();

export async function sliceCreate(): Promise<void> {
	const {
		values: { help, name },
		positionals: [id],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "create"
		options: {
			name: { type: "string", short: "n" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!id) {
		console.error("Missing required argument: id");
		process.exitCode = 1;
		return;
	}

	const model: SharedSlice = {
		id,
		type: "SharedSlice",
		name: name ?? pascalCase(id),
		description: "",
		variations: [
			{
				id: "default",
				name: "Default",
				description: "Default",
				imageUrl: "",
				docURL: "",
				version: "initial",
				primary: {},
				items: {},
			},
		],
	};

	const slicesDirectory = await getSlicesDirectory();
	const sliceDirectory = new URL(pascalCase(model.name) + "/", slicesDirectory);
	const modelPath = new URL("model.json", sliceDirectory);

	try {
		await mkdir(new URL(".", modelPath), { recursive: true });
		await writeFile(modelPath, stringify(model));
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to create slice: ${error.message}`);
		} else {
			console.error(`Failed to create slice`);
		}
		process.exitCode = 1;
		return;
	}

	console.info(`Created slice at ${modelPath.href}`);
}

async function getSlicesDirectory(): Promise<URL> {
	const framework = await detectFramework();
	const projectRoot = await findUpward("package.json");
	switch (framework) {
		case "next": {
			const hasSrcDir = await exists(new URL("src", projectRoot));
			if (hasSrcDir) return new URL("src/slices/", projectRoot);
		}
		case "nuxt": {
			const hasAppDir = await exists(new URL("app", projectRoot));
			if (hasAppDir) return new URL("app/slices/", projectRoot);
		}
		case "sveltekit": {
			return new URL("src/slices/", projectRoot);
		}
	}
	return new URL("slices/", projectRoot);
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

function pascalCase(input: string): string {
	return input.toLowerCase().replace(/(^|[-_\s]+)(.)?/g, (_, __, c) => c?.toUpperCase() ?? "");
}
