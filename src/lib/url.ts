import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";

export function appendTrailingSlash(url: string | URL): URL {
	const newURL = new URL(url);
	if (!newURL.pathname.endsWith("/")) newURL.pathname += "/";
	return newURL;
}

// One DNS label: 1-63 letters, digits, or hyphens, with no hyphen at either end.
// Check the raw string: URL parsing drops newlines and tabs without an error.
export function isSubdomain(value: string): boolean {
	return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(value);
}

export function relativePathname(a: URL, b: URL): string {
	return relative(fileURLToPath(a), fileURLToPath(b));
}

export function getExtension(url: URL): string | undefined {
	const dotIndex = url.pathname.lastIndexOf(".");
	if (dotIndex === -1) return undefined;
	return url.pathname.slice(dotIndex + 1).toLowerCase() || undefined;
}

export function isDescendant(a: URL, b: URL): boolean {
	const rel = relative(fileURLToPath(a), fileURLToPath(b));
	if (!rel) return false; // same path, not a descendant
	if (rel.startsWith("..")) return false; // outside parent
	if (isAbsolute(rel)) return false; // different drive (Windows)
	return true;
}
