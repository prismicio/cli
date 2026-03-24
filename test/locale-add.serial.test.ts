import { it } from "./it";
import { getLocales, resetLocales } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("locale", ["add", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic locale add <code> [options]");
});

it("adds a locale", async ({ expect, prismic, repo, token, host }) => {
	await resetLocales({ repo, token, host });

	const { stdout, exitCode } = await prismic("locale", ["add", "fr-fr"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Locale added: fr-fr");

	const locales = await getLocales({ repo, token, host });
	const locale = locales.find((l) => l.id === "fr-fr");
	expect(locale).toBeDefined();
});

it("adds a locale with a custom name", async ({ expect, prismic, repo, token, host }) => {
	await resetLocales({ repo, token, host });

	const { stdout, exitCode } = await prismic("locale", ["add", "ab-cd", "--name", "Custom Locale"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Locale added: ab-cd");

	const locales = await getLocales({ repo, token, host });
	const locale = locales.find((l) => l.id === "ab-cd");
	expect(locale?.customName).toBe("Custom Locale");
});

it("adds a locale as master", async ({ expect, prismic, repo, token, host }) => {
	await resetLocales({ repo, token, host });

	const { stdout, exitCode } = await prismic("locale", ["add", "fr-fr", "--master"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Locale added: fr-fr");

	const locales = await getLocales({ repo, token, host });
	const locale = locales.find((l) => l.id === "fr-fr");
	expect(locale?.isMaster).toBe(true);
});
