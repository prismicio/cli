import { readHost } from "./auth";

export async function getRepoUrl(repo: string): Promise<URL> {
	const host = await readHost();
	host.hostname = `${repo}.${host.hostname}`;
	return appendTrailingSlash(host);
}

export async function getInternalApiUrl(): Promise<URL> {
	const host = await readHost();
	host.hostname = `api.internal.${host.hostname}`;
	return appendTrailingSlash(host);
}

export async function getUserServiceUrl(): Promise<URL> {
	const host = await readHost();
	host.hostname = `user-service.${host.hostname}`;
	return appendTrailingSlash(host);
}

function appendTrailingSlash(url: URL) {
	const newURL = new URL(url);
	if (!url.pathname.endsWith("/")) url.pathname += "/";
	return newURL;
}
