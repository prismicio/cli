import { it } from "./it";
import { upsertLocale, getLocales, resetLocales } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("locale", ["set-master", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic locale set-master <code> [options]");
});

it("sets the master locale", async ({ expect, prismic, repo, token, host }) => {
	await resetLocales({ repo, token, host });
	await upsertLocale("fr-fr", { repo, token, host });

	const { stdout, exitCode } = await prismic("locale", ["set-master", "fr-fr"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Master locale set: fr-fr");

	const locales = await getLocales({ repo, token, host });
	const locale = locales.find((l) => l.id === "fr-fr");
	expect(locale?.isMaster).toBe(true);
});

it("errors when locale is already master", async ({ expect, prismic, repo, token, host }) => {
	await resetLocales({ repo, token, host });
	const locales = await getLocales({ repo, token, host });
	const master = locales.find((l) => l.isMaster);
	if (!master) return;

	const { stderr, exitCode } = await prismic("locale", ["set-master", master.id]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("already the master");
});
