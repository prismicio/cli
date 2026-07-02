import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";

export async function readEnvFile(path: URL): Promise<Record<string, string | undefined>> {
	try {
		return parseEnv(await readFile(path, "utf8"));
	} catch {
		return {};
	}
}

export async function setEnvVar(path: URL, key: string, value: string): Promise<void> {
	let contents = "";
	try {
		contents = await readFile(path, "utf8");
	} catch {}

	const line = `${key}=${value}`;
	const pattern = new RegExp(`^${key}=.*$`, "m");
	if (pattern.test(contents)) {
		contents = contents.replace(pattern, line);
	} else {
		if (contents && !contents.endsWith("\n")) contents += "\n";
		contents += `${line}\n`;
	}

	await writeFile(path, contents);
}

export async function removeEnvVar(path: URL, key: string): Promise<void> {
	let contents: string;
	try {
		contents = await readFile(path, "utf8");
	} catch {
		return;
	}
	await writeFile(path, contents.replace(new RegExp(`^${key}=.*\\n?`, "m"), ""));
}
