import { relative } from "node:path";
import { fileURLToPath } from "node:url";

export function appendTrailingSlash(url: string | URL): URL {
	const newURL = new URL(url);
	if (!newURL.pathname.endsWith("/")) newURL.pathname += "/";
	return newURL;
}

export function relativePathname(a: URL, b: URL): string {
	return relative(fileURLToPath(a), fileURLToPath(b));
}

export function getExtension(url: URL): string | undefined {
	const dotIndex = url.pathname.lastIndexOf(".");
	if (dotIndex === -1) return undefined;
	return url.pathname.slice(dotIndex + 1).toLowerCase() || undefined;
}
