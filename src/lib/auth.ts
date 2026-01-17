import { access, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const AUTH_FILE_PATH = new URL(".prismic", appendTrailingSlash(pathToFileURL(homedir())));
const DEFAULT_HOST = new URL("https://prismic.io");

type AuthContents = {
	token?: string;
	host?: string;
};

export async function authenticatedFetch(
	...[input, init]: Parameters<typeof fetch>
): Promise<Response> {
	const request = new Request(input, init);
	const token = await readToken();
	if (token) request.headers.set("Cookie", `prismic-auth=${token}`);
	return fetch(request);
}

export async function saveToken(token: string, options?: { host?: string }): Promise<void> {
	const contents: AuthContents = { token, host: options?.host };
	await writeFile(AUTH_FILE_PATH, JSON.stringify(contents, null, 2));
}

export async function isAuthenticated(): Promise<boolean> {
	const token = await readToken();
	return Boolean(token);
}

export async function readToken(): Promise<string | undefined> {
	const auth = await readAuthFile();
	return auth?.token;
}

export async function readHost(): Promise<URL> {
	try {
		const auth = await readAuthFile();
		if (!auth?.host) return DEFAULT_HOST;
		return new URL(auth.host);
	} catch {
		return DEFAULT_HOST;
	}
}

async function readAuthFile(): Promise<AuthContents | undefined> {
	try {
		const contents = await readFile(AUTH_FILE_PATH, "utf-8");
		return JSON.parse(contents);
	} catch {
		return undefined;
	}
}

export async function removeToken(): Promise<boolean> {
	try {
		await access(AUTH_FILE_PATH);
	} catch {
		return true;
	}

	const auth = await readAuthFile();
	if (!auth) return false;
	await rm(AUTH_FILE_PATH);
	return true;
}

function appendTrailingSlash(url: string | URL) {
	const newURL = new URL(url);
	if (!newURL.pathname.endsWith("/")) newURL.pathname += "/";
	return newURL;
}
