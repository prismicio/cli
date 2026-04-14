import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as z from "zod/mini";

import { appendTrailingSlash, getExtension } from "./url";

export async function findUpward(
	name: string,
	config: { start?: URL; stop?: URL | string } = {},
): Promise<URL | undefined> {
	const { start = pathToFileURL(process.cwd()), stop } = config;

	let dir = appendTrailingSlash(start);

	while (true) {
		const path = new URL(name, dir);
		try {
			await access(path);
			return path;
		} catch {}

		if (typeof stop === "string") {
			const stopPath = new URL(stop, dir);
			try {
				await access(stopPath);
				return;
			} catch {}
		} else if (stop instanceof URL) {
			if (stop.href === dir.href) {
				return;
			}
		}

		const parent = new URL("..", dir);
		if (parent.href === dir.href) {
			return undefined;
		}

		dir = parent;
	}
}

export async function exists(path: URL): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

export async function writeFileRecursive(
	path: URL,
	data: Parameters<typeof writeFile>[1],
): Promise<void> {
	const dirname = new URL(".", path);
	await mkdir(dirname, { recursive: true });
	await writeFile(path, data);
}

export async function readJsonFile<T = unknown>(
	path: URL,
	options: { schema?: z.ZodMiniType<T> } = {},
): Promise<T> {
	const { schema } = options;
	const file = await readFile(path, "utf8");
	const json = JSON.parse(file);
	if (schema) return z.parse(schema, json);
	return json;
}

const MIME_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
};

export async function readURLFile(url: URL): Promise<Blob> {
	if (url.protocol === "http:" || url.protocol === "https:") {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(
				`Failed to download file from "${url.toString()}" (HTTP ${response.status}).`,
			);
		}
		return await response.blob();
	}

	if (url.protocol === "file:") {
		const buffer = await readFile(url);
		const extension = getExtension(url);
		const type = extension
			? MIME_TYPES[extension] || "application/octet-stream"
			: "application/octet-stream";
		return new Blob([buffer], { type });
	}

	throw new Error(`Unsupported file protocol: ${url.protocol}`);
}
