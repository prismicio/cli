import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import * as z from "zod/mini";

import { appendTrailingSlash } from "./url";

// Searches the current directory and its ancestors. The search ends without a
// result at a directory that contains `stop`.
export async function findUpward(
	name: string,
	config: { stop?: string } = {},
): Promise<URL | undefined> {
	let dir = appendTrailingSlash(pathToFileURL(process.cwd()));
	while (true) {
		const path = new URL(name, dir);
		if (await exists(path)) return path;
		if (config.stop && (await exists(new URL(config.stop, dir)))) return;

		const parent = new URL("..", dir);
		if (parent.href === dir.href) return;
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
	await mkdir(new URL(".", path), { recursive: true });
	await writeFile(path, data);
}

export async function readJsonFile<T = unknown>(
	path: URL,
	options: { schema?: z.ZodMiniType<T> } = {},
): Promise<T> {
	const json = JSON.parse(await readFile(path, "utf8"));
	return options.schema ? z.parse(options.schema, json) : json;
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
		const extension = url.pathname.slice(url.pathname.lastIndexOf(".") + 1).toLowerCase();
		const type = MIME_TYPES[extension] || "application/octet-stream";
		return new Blob([await readFile(url)], { type });
	}

	throw new Error(`Unsupported file protocol: ${url.protocol}`);
}

export async function readEnvFile(path: URL): Promise<Partial<Record<string, string>>> {
	return parseEnv(await readFile(path, "utf8"));
}

export async function setEnvFileVar(path: URL, key: string, value: string): Promise<void> {
	let contents = (await exists(path)) ? await readFile(path, "utf8") : "";
	const pattern = new RegExp(`^${key}=.*$`, "mg");
	const line = `${key}=${value}`;

	if (pattern.test(contents)) {
		contents = contents.replace(pattern, line);
	} else {
		if (contents && !contents.endsWith("\n")) contents += "\n";
		contents += `${line}\n`;
	}

	await writeFile(path, contents);
}

export async function unsetEnvFileVar(path: URL, key: string): Promise<void> {
	if (!(await exists(path))) return;
	const contents = await readFile(path, "utf8");
	await writeFile(path, contents.replace(new RegExp(`^${key}=.*$\n?`, "mg"), ""));
}
