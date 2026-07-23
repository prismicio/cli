import { describe } from "vitest";

import { it } from "./it";
import { upsertLocale, getLocales } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("locale", ["remove", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic locale remove <code> [options]");
});

describe("with an isolated repository", () => {
	it.scoped({ isolateRepo: true });

	it("removes a locale", async ({ expect, prismic, repo, token, host }) => {
		await upsertLocale("fr-fr", { repo, token, host });

		const { stdout, stderr, exitCode } = await prismic("locale", ["remove", "fr-fr"]);
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain("Locale removed: fr-fr");

		const locales = await getLocales({ repo, token, host });
		const locale = locales.find((l) => l.id === "fr-fr");
		expect(locale).toBeUndefined();
	});
});
