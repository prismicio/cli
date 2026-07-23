import { unzipSync } from "fflate";
import { mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, win32 } from "node:path";

export async function extractZip(
	data: Uint8Array,
	destination: string,
	options: { stripSingleRootDirectory?: boolean } = {},
): Promise<void> {
	await assertEmptyOrMissingDirectory(destination);

	const parent = dirname(destination);
	await mkdir(parent, { recursive: true });
	const temporaryDirectory = await mkdtemp(join(parent, `.${basename(destination)}-`));

	try {
		const files = unzipSync(data);
		const entries = Object.entries(files).map(([entryName, contents]) => ({
			entryName,
			contents,
			relativePath: normalizeEntryPath(entryName),
		}));
		const rootDirectory = options.stripSingleRootDirectory
			? getSingleRootDirectory(entries)
			: undefined;

		for (const { entryName, contents, relativePath: entryPath } of entries) {
			const relativePath = rootDirectory
				? entryPath.slice(rootDirectory.length).replace(/^\/+/, "")
				: entryPath;
			if (!relativePath) continue;

			const path = join(temporaryDirectory, relativePath);
			if (entryName.endsWith("/") || entryName.endsWith("\\")) {
				await mkdir(path, { recursive: true });
			} else {
				await mkdir(dirname(path), { recursive: true });
				await writeFile(path, contents);
			}
		}

		await rm(destination, { recursive: true, force: true });
		await rename(temporaryDirectory, destination);
	} catch (error) {
		await rm(temporaryDirectory, { recursive: true, force: true });
		throw error;
	}
}

function getSingleRootDirectory(entries: { entryName: string; relativePath: string }[]): string {
	const rootDirectories = new Set(
		entries
			.map(({ relativePath }) => relativePath.split("/")[0])
			.filter((rootDirectory) => rootDirectory),
	);
	if (rootDirectories.size !== 1) {
		throw new Error("ZIP archive does not contain a single root directory.");
	}

	const [rootDirectory] = rootDirectories;
	const hasInvalidRootEntry = entries.some(
		({ entryName, relativePath }) =>
			(relativePath === rootDirectory && !entryName.endsWith("/") && !entryName.endsWith("\\")) ||
			(relativePath !== rootDirectory && !relativePath.startsWith(`${rootDirectory}/`)),
	);
	if (!rootDirectory || hasInvalidRootEntry) {
		throw new Error("ZIP archive does not contain a single root directory.");
	}

	return rootDirectory;
}

async function assertEmptyOrMissingDirectory(destination: string): Promise<void> {
	try {
		const destinationStat = await stat(destination);
		if (!destinationStat.isDirectory()) {
			throw new Error(`Destination already exists and is not a directory: ${destination}`);
		}
		if ((await readdir(destination)).length > 0) {
			throw new Error(`Destination directory is not empty: ${destination}`);
		}
	} catch (error) {
		if (isMissingFileError(error)) return;
		throw error;
	}
}

function normalizeEntryPath(entryName: string): string {
	const normalized = entryName.replaceAll("\\", "/");
	if (isAbsolute(normalized) || win32.isAbsolute(normalized)) {
		throw new Error(`ZIP entry has an absolute path: ${entryName}`);
	}

	const segments = normalized.split("/").filter((segment) => segment && segment !== ".");
	if (segments.includes("..")) {
		throw new Error(`ZIP entry escapes the destination: ${entryName}`);
	}

	return segments.join("/");
}

function isMissingFileError(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}
