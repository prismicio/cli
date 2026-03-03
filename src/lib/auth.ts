import { access, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

import { appendTrailingSlash, getAuthUrl } from "./url";

const AUTH_FILE_PATH = new URL(
	".prismic",
	appendTrailingSlash(pathToFileURL(homedir())),
);
const DEFAULT_HOST = "https://prismic.io";

type AuthContents = {
	token?: string;
	host?: string;
};

export async function saveToken(
	token: string,
	options?: { host?: string },
): Promise<void> {
	const contents: AuthContents = { token, host: options?.host };
	await writeFile(AUTH_FILE_PATH, JSON.stringify(contents, null, 2));
}

export async function isAuthenticated(): Promise<boolean> {
	const auth = await readAuthFile();
	const token = auth?.token;
	if (!token) return false;

	try {
		const authUrl = await getAuthUrl();
		const url = new URL("authentication/refreshAuthToken", authUrl);

		const response = await fetch(url, {
			method: "POST",
			headers: {
				Cookie: `prismic-auth=${token}`,
			},
		});

		if (!response.ok) {
			await removeToken();
			return false;
		}

		const newToken = parsePrismicAuthCookie(response);
		if (newToken && newToken !== token) {
			await saveToken(newToken, { host: auth.host });
		}

		return true;
	} catch {
		return false;
	}
}

export async function readToken(): Promise<string | undefined> {
	const auth = await readAuthFile();
	return auth?.token;
}

export async function readHost(): Promise<URL> {
	try {
		const auth = await readAuthFile();
		if (!auth?.host) return new URL(DEFAULT_HOST);
		return new URL(auth.host);
	} catch {
		return new URL(DEFAULT_HOST);
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

function parsePrismicAuthCookie(response: Response): string | undefined {
	const setCookies = response.headers.getSetCookie();
	for (const cookie of setCookies) {
		if (cookie.startsWith("prismic-auth=")) {
			return cookie.split("=", 2)[1]?.split(";")[0];
		}
	}
	return undefined;
}
