import { it } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("env", ["list", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic env list [options]");
});

it("lists environments including production", async ({ expect, prismic, repo }) => {
	const { stdout, exitCode } = await prismic("env", ["list"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(repo);
	expect(stdout).toContain("prod");
});

// Wroom 500s under concurrent same-user write-token creates; keep this sequential.
it(
	"lists environments with a Write API token",
	{ concurrent: false },
	async ({ expect, prismic, repo, writeToken }) => {
		const { stdout, stderr, exitCode } = await prismic("env", ["list"], {
			nodeOptions: { env: { PRISMIC_TOKEN: writeToken } },
		});
		expect(exitCode, stderr).toBe(0);
		expect(stdout).toContain(repo);
	},
);
