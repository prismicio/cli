import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const PRISMIC_AUTH_FILE = new URL(".prismic", pathToFileURL(homedir() + "/"));

export async function logout(): Promise<void> {
	const { values } = parseArgs({
		args: process.argv.slice(3),
		options: { help: { type: "boolean", short: "h" } },
	});

	if (values.help) {
		console.info("Usage: prismic logout\n\nLog out of Prismic.");
		return;
	}

	let contents: string;
	try {
		contents = await readFile(PRISMIC_AUTH_FILE, "utf-8");
	} catch {
		// File doesn't exist - already logged out
		console.info("Logged out of Prismic");
		return;
	}

	if (!isPrismicAuthFile(contents)) {
		console.error("Auth file exists but has unexpected format. Not deleting.");
		process.exitCode = 1;
		return;
	}

	await rm(PRISMIC_AUTH_FILE);
	console.info("Logged out of Prismic");
}

function isPrismicAuthFile(contents: string): boolean {
	try {
		const data = JSON.parse(contents);
		return (
			typeof data === "object" &&
			data !== null &&
			typeof data.base === "string" &&
			Array.isArray(data.cookies) &&
			data.cookies.every((c: unknown) => typeof c === "string")
		);
	} catch {
		return false;
	}
}
