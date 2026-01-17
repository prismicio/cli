import { readHost } from "./auth";

export async function getRepoDashboardUrl(repo: string): Promise<URL> {
	const host = await readHost();
	host.hostname = `${repo}.${host.hostname}`;
	return host;
}

export async function getInternalApiUrl(): Promise<URL> {
	const host = await readHost();
	host.hostname = `api.internal.${host.hostname}`;
	return host;
}
