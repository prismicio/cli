import { describe } from "vitest";

import { isolatedRepo, it } from "./it";
import { upsertLocale } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("locale", ["list", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic locale list [options]");
});

describe("with an isolated repository", () => {
	it.scoped({ repo: isolatedRepo });

	it("lists locales", async ({ expect, prismic, repo, token, host }) => {
		await upsertLocale("fr-fr", { repo, token, host });

		const { stdout, exitCode } = await prismic("locale", ["list"]);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("fr-fr");
	});

	it("lists locales as JSON", async ({ expect, prismic, repo, token, host }) => {
		await upsertLocale("fr-fr", { repo, token, host });

		const { stdout, exitCode } = await prismic("locale", ["list", "--json"]);
		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed).toEqual(expect.arrayContaining([expect.objectContaining({ id: "fr-fr" })]));
	});
});
