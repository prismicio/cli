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
