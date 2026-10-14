import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["list", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic repo list [options]");
});

it("lists repositories", async ({ expect, prismic, repo }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["list"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain(repo);
});

it("lists repositories as JSON", async ({ expect, prismic, repo }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["list", "--json"]);
	expect(exitCode, stderr).toBe(0);
	const parsed = JSON.parse(stdout);
	expect(parsed).toEqual(expect.arrayContaining([expect.objectContaining({ domain: repo })]));
});

it("lists the one repository a Write API token can write to", async ({
	expect,
	prismic,
	repo,
	host,
	home,
	writeToken,
}) => {
	const fetches = await recordFetches(home);
	const { stdout, stderr, exitCode } = await prismic("repo", ["list", "--json"], {
		nodeOptions: { env: { PRISMIC_TOKEN: writeToken, ...fetches.env } },
	});
	expect(exitCode, stderr).toBe(0);
	const parsed: unknown = JSON.parse(stdout);
	expect(parsed).toEqual([
		{
			domain: repo,
			name: expect.any(String),
			role: expect.any(String),
			url: `https://${repo}.${host}/`,
		},
	]);
	const urls = await fetches.urls();
	expect(urls).toContain(`https://api.internal.${host}/user/repositories`);
	expect(urls).not.toContain(`https://user-service.${host}/repositories`);
});

it("requests the legacy user service when signed in", async ({ expect, prismic, host, home }) => {
	const fetches = await recordFetches(home);
	const { stderr, exitCode } = await prismic("repo", ["list"], {
		nodeOptions: { env: fetches.env },
	});
	expect(exitCode, stderr).toBe(0);
	const urls = await fetches.urls();
	expect(urls).toContain(`https://user-service.${host}/repositories`);
	expect(urls).not.toContain(`https://api.internal.${host}/user/repositories`);
});

async function recordFetches(home: URL): Promise<{
	env: { NODE_OPTIONS: string; PRISMIC_TEST_FETCH_LOG: string };
	urls: () => Promise<string[]>;
}> {
	const log = new URL("fetch-log.txt", home);
	const recorder = new URL("record-fetch.mjs", home);
	await writeFile(recorder, FETCH_RECORDER);
	return {
		env: {
			NODE_OPTIONS: `--import ${recorder.href}`,
			PRISMIC_TEST_FETCH_LOG: fileURLToPath(log),
		},
		urls: async () => {
			const text = await readFile(log, "utf8").catch(() => "");
			return text.split("\n").filter((line) => line.length > 0);
		},
	};
}

const FETCH_RECORDER = `
import { appendFileSync } from "node:fs";

const logPath = process.env.PRISMIC_TEST_FETCH_LOG;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
	const url = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
	appendFileSync(logPath, url + "\\n");
	return originalFetch(input, init);
};
`;
