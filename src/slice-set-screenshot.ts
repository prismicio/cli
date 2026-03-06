import type { SharedSlice } from "@prismicio/types-internal/lib/customtypes";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parseArgs } from "node:util";
import * as v from "valibot";

import { isAuthenticated } from "./lib/auth";
import { safeGetRepositoryFromConfig } from "./lib/config";
import { requireFramework } from "./lib/framework-adapter";
import { request } from "./lib/request";

const HELP = `
Set a screenshot for a slice variation.

USAGE
  prismic slice set-screenshot <slice-id> <image-path> [flags]

ARGUMENTS
  slice-id       Slice identifier (required)
  image-path     Path to the image file (required)

FLAGS
  -v, --variation string  Variation ID (default: "default")
  -r, --repo string       Repository name (uses config if not provided)
  -h, --help              Show help for command

EXAMPLES
  prismic slice set-screenshot MySlice ./screenshot.png
  prismic slice set-screenshot MySlice ./screenshot.png --variation dark
  prismic slice set-screenshot MySlice ./screenshot.png --repo my-repo
`.trim();

const ACLCreateResponseSchema = v.object({
	uploadEndpoint: v.string(),
	requiredFormDataFields: v.record(v.string(), v.string()),
	imgixEndpoint: v.string(),
});

export type UploadScreenshotArgs = {
	data: Buffer;
	repo: string;
	sliceId: string;
	variationId: string;
	filename: string;
};

export async function uploadScreenshot(args: UploadScreenshotArgs): Promise<string> {
	const { data, repo, sliceId, variationId, filename } = args;

	// Get upload credentials from ACL provider
	const aclResponse = await request("https://acl-provider.prismic.io/create", {
		method: "POST",
		body: {},
		schema: ACLCreateResponseSchema,
	});

	if (!aclResponse.ok) {
		throw new Error("Failed to get upload credentials from Prismic");
	}

	const { uploadEndpoint, requiredFormDataFields, imgixEndpoint } = aclResponse.value;

	// Generate content digest for unique filename
	const digest = createHash("md5").update(data).digest("hex");
	const ext = extname(filename).toLowerCase().slice(1) || "png";

	// Build the S3 key path
	const key = `${repo}/shared-slices/${sliceId}/${variationId}/${digest}.${ext}`;

	// Create FormData for S3 upload
	const formData = new FormData();
	for (const [field, value] of Object.entries(requiredFormDataFields)) {
		formData.append(field, value);
	}
	formData.append("key", key);
	formData.append("Content-Type", getMimeType(ext));
	formData.append("file", new Blob([new Uint8Array(data)], { type: getMimeType(ext) }), filename);

	// Upload to S3
	const uploadResponse = await fetch(uploadEndpoint, {
		method: "POST",
		body: formData,
	});

	if (!uploadResponse.ok) {
		const text = await uploadResponse.text();
		throw new Error(`Failed to upload screenshot: ${text}`);
	}

	// Construct Imgix URL
	const imgixUrl = `${imgixEndpoint}/${key}?auto=compress,format`;

	return imgixUrl;
}

function getMimeType(ext: string): string {
	switch (ext) {
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "gif":
			return "image/gif";
		case "webp":
			return "image/webp";
		default:
			return "image/png";
	}
}

export async function sliceSetScreenshot(): Promise<void> {
	const {
		values: { help, variation, repo: repoFlag },
		positionals: [sliceId, imagePath],
	} = parseArgs({
		args: process.argv.slice(4), // skip: node, script, "slice", "set-screenshot"
		options: {
			variation: { type: "string", short: "v", default: "default" },
			repo: { type: "string", short: "r" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
	});

	if (help) {
		console.info(HELP);
		return;
	}

	if (!sliceId) {
		console.error("Missing required argument: slice-id\n");
		console.error("Usage: prismic slice set-screenshot <slice-id> <image-path>");
		process.exitCode = 1;
		return;
	}

	if (!imagePath) {
		console.error("Missing required argument: image-path\n");
		console.error("Usage: prismic slice set-screenshot <slice-id> <image-path>");
		process.exitCode = 1;
		return;
	}

	// Check authentication
	const authenticated = await isAuthenticated();
	if (!authenticated) {
		console.error("You must be logged in to set a screenshot.");
		console.error("Run `prismic login` to authenticate.");
		process.exitCode = 1;
		return;
	}

	// Resolve repository
	const repo = repoFlag ?? (await safeGetRepositoryFromConfig());
	if (!repo) {
		console.error("Could not determine repository.");
		console.error("Use --repo flag or run from a directory with prismic.config.json");
		process.exitCode = 1;
		return;
	}

	// Find the slice model
	const framework = await requireFramework();
	if (!framework) return;

	let model: SharedSlice;
	try {
		model = await framework.readSlice(sliceId);
	} catch {
		console.error(`Slice not found: ${sliceId}\n\nCreate it first with: prismic slice create ${sliceId}`);
		process.exitCode = 1;
		return;
	}

	// Find the variation
	const variationIndex = model.variations.findIndex((v) => v.id === variation);
	if (variationIndex === -1) {
		console.error(`Variation "${variation}" not found in slice "${sliceId}"`);
		console.error(`Available variations: ${model.variations.map((v) => v.id).join(", ")}`);
		process.exitCode = 1;
		return;
	}

	// Read the image file
	let imageData: Buffer;
	try {
		imageData = await readFile(imagePath);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to read image file: ${error.message}`);
		} else {
			console.error("Failed to read image file");
		}
		process.exitCode = 1;
		return;
	}

	// Upload the screenshot
	let imageUrl: string;
	try {
		imageUrl = await uploadScreenshot({
			data: imageData,
			repo,
			sliceId,
			variationId: variation ?? "default",
			filename: imagePath,
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

	// Update the model
	model.variations[variationIndex].imageUrl = imageUrl;

	// Write updated model
	try {
		await framework.updateSlice(model);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Failed to update slice model: ${error.message}`);
		} else {
			console.error("Failed to update slice model");
		}
		process.exitCode = 1;
		return;
	}

	console.info(`Screenshot set for slice "${sliceId}" variation "${variation}"`);
	console.info(`URL: ${imageUrl}`);
}
