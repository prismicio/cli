import { it } from "./it";
import { upsertLocale, getLocales, resetLocales } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("locale", ["remove", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic locale remove <code> [options]");
});

it("removes a locale", async ({ expect, prismic, repo, token, host }) => {
	await resetLocales({ repo, token, host });
	await upsertLocale("fr-fr", { repo, token, host });

	const { stdout, exitCode } = await prismic("locale", ["remove", "fr-fr"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Locale removed: fr-fr");

	const locales = await getLocales({ repo, token, host });
	const locale = locales.find((l) => l.id === "fr-fr");
	expect(locale).toBeUndefined();
});
