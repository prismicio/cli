import { existsSync, watch } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

import * as z from "zod/mini";

import { appendTrailingSlash, getExtension } from "./url";

// Searches the current directory and its ancestors. The search ends without a
// result at a directory that contains `stop`.
export async function findUpward(
	name: string,
	config: { stop?: string } = {},
): Promise<URL | undefined> {
	const { stop } = config;

	let dir = appendTrailingSlash(pathToFileURL(process.cwd()));

	while (true) {
		const path = new URL(name, dir);
		if (await exists(path)) {
			return path;
		}

		if (stop && (await exists(new URL(stop, dir)))) {
			return;
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

/**
 * Watches files and returns a function that waits until one changes or the
 * timeout passes. A change that happens between waits ends the next wait at once.
 */
export function watchFiles(
	paths: URL[],
	signal: AbortSignal,
): (timeoutMs: number) => Promise<void> {
	let changed = false;
	let wake = (): void => {};
	let debounce: NodeJS.Timeout | undefined;
	const onChange = (): void => {
		clearTimeout(debounce);
		debounce = setTimeout(() => {
			changed = true;
			wake();
		}, 100);
	};
	for (const path of paths) {
		if (!existsSync(path)) continue;
		watch(path, { recursive: true, signal }, onChange).on("error", () => {});
	}
	return async (timeoutMs) => {
		if (!changed) {
			await new Promise<void>((resolve) => {
				const timeout = setTimeout(resolve, timeoutMs);
				wake = () => {
					clearTimeout(timeout);
					resolve();
				};
			});
		}
		changed = false;
	};
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
	let json: unknown;
	try {
		json = JSON.parse(file);
	} catch (cause) {
		throw new SyntaxError(`${relative(process.cwd(), fileURLToPath(path))} isn't valid JSON.`, {
			cause,
		});
	}
	if (schema) return z.parse(schema, json);
	return json as T;
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

export async function readEnvFile(path: URL): Promise<Partial<Record<string, string>>> {
	const contents = await readFile(path, "utf8");
	return parseEnv(contents);
}

export async function setEnvFileVar(path: URL, key: string, value: string): Promise<void> {
	const hasFile = await exists(path);
	let contents = "";
	if (hasFile) contents = await readFile(path, "utf8");

	const pattern = new RegExp(`^${key}=.*$`, "mg");
	const line = `${key}=${value}`;
	const hasEnvironmentVar = pattern.test(contents);

	if (hasEnvironmentVar) {
		contents = contents.replace(pattern, line);
	} else {
		if (contents && !contents.endsWith("\n")) contents += "\n";
		contents += `${line}\n`;
	}

	await writeFile(path, contents);
}

export async function unsetEnvFileVar(path: URL, key: string): Promise<void> {
	const hasFile = await exists(path);
	if (!hasFile) return;

	let contents = await readFile(path, "utf8");

	const pattern = new RegExp(`^${key}=.*$\n?`, "mg");
	contents = contents.replace(pattern, "");

	await writeFile(path, contents);
}
