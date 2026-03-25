import { it } from "./it";
import { getRepositoryAccess } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("repo", ["set-api-access", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic repo set-api-access <level> [options]");
});

it("sets the repository API access level", async ({ expect, prismic, repo, token, host }) => {
	const { exitCode } = await prismic("repo", ["set-api-access", "open"]);
	expect(exitCode).toBe(0);

	const access = await getRepositoryAccess({ repo, token, host });
	expect(access).toBe("open");
});
