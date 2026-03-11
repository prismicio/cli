export function appendTrailingSlash(url: string | URL): URL {
	const newURL = new URL(url);
	if (!newURL.pathname.endsWith("/")) newURL.pathname += "/";
	return newURL;
}
