import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

export const PRISMIC_AUTH_FILE = new URL(".prismic", pathToFileURL(homedir() + "/"));
export const PRISMIC_BASE_URL = "https://prismic.io";

export interface Credentials {
	base: string;
	cookies: string[];
	shortId?: string;
	intercomHash?: string;
}

export async function getCredentials(): Promise<Credentials | null> {
	let contents: string;
	try {
		contents = await readFile(PRISMIC_AUTH_FILE, "utf-8");
	} catch {
		return null;
	}

	try {
		const data = JSON.parse(contents);
		if (isValidCredentials(data)) {
			return data;
		}
		return null;
	} catch {
		return null;
	}
}

function isValidCredentials(data: unknown): data is Credentials {
	return (
		typeof data === "object" &&
		data !== null &&
		"base" in data &&
		typeof data.base === "string" &&
		"cookies" in data &&
		Array.isArray(data.cookies) &&
		data.cookies.every((c: unknown) => typeof c === "string")
	);
}

export function getCookieValue(cookies: string[], name: string): string | null {
	for (const cookie of cookies) {
		const [cookieName, ...rest] = cookie.split("=");
		if (cookieName === name) {
			return rest.join("=").split(";")[0];
		}
	}
	return null;
}
