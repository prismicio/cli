import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { appendTrailingSlash } from "./url";

export async function getGitRoot(start: URL): Promise<URL | undefined> {
	const result = await runGit(["rev-parse", "--show-toplevel"], start);
	if (!result || result.code !== 0) return undefined;
	const top = result.stdout.trim();
	if (!top) return undefined;
	return appendTrailingSlash(pathToFileURL(top));
}

export async function getDirtyTrackedPaths(gitRoot: URL): Promise<URL[]> {
	const result = await runGit(["status", "--porcelain", "--untracked-files=no"], gitRoot);
	if (!result || result.code !== 0) return [];
	const paths: URL[] = [];
	for (const line of result.stdout.split("\n")) {
		if (line.length < 4) continue;
		const rel = line.slice(3);
		paths.push(new URL(rel, gitRoot));
	}
	return paths;
}

export async function readFileFromHead(
	path: URL,
	gitRoot: URL,
): Promise<string | undefined> {
	const relPath = relative(fileURLToPath(gitRoot), fileURLToPath(path));
	if (!relPath || relPath.startsWith("..")) return undefined;
	const result = await runGit(["cat-file", "-p", `HEAD:${relPath}`], gitRoot);
	if (!result || result.code !== 0) return undefined;
	return result.stdout;
}

export async function mergeFile(
	local: string,
	base: string,
	remote: string,
): Promise<{ result: string; conflict: boolean }> {
	const tmp = await mkdtemp(join(tmpdir(), "prismic-merge-"));
	try {
		const localPath = join(tmp, "local");
		const basePath = join(tmp, "base");
		const remotePath = join(tmp, "remote");
		await Promise.all([
			writeFile(localPath, local),
			writeFile(basePath, base),
			writeFile(remotePath, remote),
		]);
		const result = await runGit(
			[
				"merge-file",
				"-p",
				"-L",
				"local",
				"-L",
				"base",
				"-L",
				"remote",
				localPath,
				basePath,
				remotePath,
			],
			pathToFileURL(tmp + "/"),
		);
		if (!result || result.code >= 128) {
			throw new Error("git merge-file failed");
		}
		return { result: result.stdout, conflict: result.code > 0 };
	} finally {
		await rm(tmp, { recursive: true, force: true });
	}
}

async function runGit(
	args: string[],
	cwd: URL,
): Promise<{ code: number; stdout: string } | undefined> {
	return new Promise((resolve) => {
		try {
			const child = spawn("git", args, { cwd: fileURLToPath(cwd) });
			let stdout = "";
			child.stdout.on("data", (chunk: Buffer) => {
				stdout += chunk.toString("utf8");
			});
			child.on("error", () => resolve(undefined));
			child.on("close", (code) => resolve({ code: code ?? 1, stdout }));
		} catch {
			resolve(undefined);
		}
	});
}
