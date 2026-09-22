import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";

export function appendTrailingSlash(url: string | URL): URL {
	const newURL = new URL(url);
	if (!newURL.pathname.endsWith("/")) newURL.pathname += "/";
	return newURL;
}

export function relativePathname(a: URL, b: URL): string {
	return relative(fileURLToPath(a), fileURLToPath(b));
}

export function isDescendant(a: URL, b: URL): boolean {
	const rel = relativePathname(a, b);
	// An absolute result means a different drive on Windows.
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
