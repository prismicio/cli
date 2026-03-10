import { getHost } from "./auth";

export async function getUserServiceUrl(): Promise<URL> {
	const host = await getHost();
	return new URL(`https://user-service.${host}/`);
}

export function appendTrailingSlash(url: string | URL): URL {
	const newURL = new URL(url);
	if (!newURL.pathname.endsWith("/")) newURL.pathname += "/";
	return newURL;
}
