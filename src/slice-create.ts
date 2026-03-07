import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { buildTypes } from "./codegen-types";
import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { requireFramework } from "./framework";
import { uploadScreenshot } from "./slice-set-screenshot";

const HELP = `
Create a new slice in a Prismic project.

USAGE
  prismic slice create <id> [flags]

ARGUMENTS
  id       Slice identifier (required)

FLAGS
  -n, --name string        Display name for the slice
      --screenshot string  Path to screenshot image for default variation
  -r, --repo string        Repository name (required for screenshot)
      --types string       Output file for generated types (default: "prismicio-types.d.ts")
  -h, --help               Show help for command

LEARN MORE
  Use \`prismic slice <command> --help\` for more information about a command.
`.trim();

export async function sliceCreate(): Promise<void> {
	const {
		values: { help, name, types, screenshot, repo: repoFlag },
		positionals: [id],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "create"
		options: {
			name: { type: "string", short: "n" },
			screenshot: { type: "string" },
			repo: { type: "string", short: "r" },
			types: { type: "string" },
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

	const framework = await requireFramework();
	if (!framework) return;

	// Handle screenshot upload if provided
	let screenshotUrl: string | undefined;
	if (screenshot) {
		// Check authentication
		const authenticated = await isAuthenticated();
		if (!authenticated) {
			console.error("You must be logged in to upload a screenshot.");
			console.error("Run `prismic login` to authenticate.");
			process.exitCode = 1;
			return;
		}

		// Resolve repository
		const repo = repoFlag ?? (await safeGetRepositoryFromConfig());
		if (!repo) {
			console.error("Could not determine repository for screenshot upload.");
			console.error("Use --repo flag or run from a directory with prismic.config.json");
			process.exitCode = 1;
			return;
		}

		// Read and upload the screenshot
		let imageData: Buffer;
		try {
			imageData = await readFile(screenshot);
		} catch (error) {
			if (error instanceof Error) {
				console.error(`Failed to read screenshot file: ${error.message}`);
			} else {
				console.error("Failed to read screenshot file");
			}
			process.exitCode = 1;
			return;
		}

		try {
			screenshotUrl = await uploadScreenshot({
				data: imageData,
				repo,
				sliceId: id,
				variationId: "default",
				filename: screenshot,
			});
		} catch (error) {
			if (error instanceof Error) {
				console.error(`Failed to upload screenshot: ${error.message}`);
			} else {
				console.error("Failed to upload screenshot");
			}
			process.exitCode = 1;
			return;
		}
	}

	const { pascalCase } = await import("change-case");

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
				imageUrl: screenshotUrl ?? "",
				docURL: "",
				version: "initial",
				primary: {},
				items: {},
			},
		],
	};

	const library = await framework.getDefaultSliceLibrary();

	try {
		const { modelPath } = await framework.createSlice(
			model,
			library,
		);
		console.info(`Created slice at ${modelPath.href}`);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to create slice: ${error.message}`);
		} else {
			console.error(`Failed to create slice`);
		}
		process.exitCode = 1;
		return;
	}

	try {
		await buildTypes({ output: types, framework });
		console.info(`Updated types in ${types ?? "prismicio-types.d.ts"}`);
	} catch (error) {
		console.warn(`Could not generate types: ${error instanceof Error ? error.message : error}`);
	}

	console.info();
	console.info("Next: Add fields with `prismic slice add-field`");
}
