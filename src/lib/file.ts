import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import * as z from "zod/mini";

import { appendTrailingSlash } from "./url";

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
