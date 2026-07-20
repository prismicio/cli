import { unzip } from "fflate";
import { mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, win32 } from "node:path";

export async function extractZip(data: Uint8Array, destination: string): Promise<void> {
	await assertEmptyOrMissingDirectory(destination);

	const parent = dirname(destination);
	await mkdir(parent, { recursive: true });
	const temporaryDirectory = await mkdtemp(join(parent, `.${basename(destination)}-`));

	try {
		const files = await unzipArchive(data);
		for (const [entryName, contents] of Object.entries(files)) {
			const relativePath = normalizeEntryPath(entryName);
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

function unzipArchive(data: Uint8Array): Promise<Record<string, Uint8Array>> {
	return new Promise((resolve, reject) => {
		unzip(data, (error, files) => {
			if (error) {
				reject(error);
			} else {
				resolve(files);
			}
		});
	});
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
