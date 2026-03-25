import { it } from "./it";
import { getRepository } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("repo", ["set-name", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic repo set-name <name> [options]");
});

it("sets the repository display name", async ({ expect, prismic, repo, token, host }) => {
	const name = `Test ${crypto.randomUUID().slice(0, 8)}`;
	const { stdout, exitCode } = await prismic("repo", ["set-name", name]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Repository name set to:");

	const repository = await getRepository({ repo, token, host });
	expect(repository.name).toBe(name);
});
