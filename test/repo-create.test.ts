import { onTestFinished } from "vitest";

import { it } from "./it";
import { deleteRepository, getRepository } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("repo", ["create", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic repo create [options]");
});

it("creates a repository", async ({ expect, prismic, token, host, password }) => {
	const { stdout, exitCode } = await prismic("repo", ["create"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Repository created:");

	const domain = stdout.match(/Repository created: (\S+)/)?.[1];
	expect(domain).toBeDefined();

	onTestFinished(() => deleteRepository(domain!, { token, password, host }));

	const repository = await getRepository({ repo: domain!, token, host });
	expect(repository).toBeDefined();
});

it("creates a repository with a name", async ({ expect, prismic, token, host, password }) => {
	const name = `Test ${crypto.randomUUID().slice(0, 8)}`;
	const { stdout, exitCode } = await prismic("repo", ["create", "--name", name]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("Repository created:");

	const domain = stdout.match(/Repository created: (\S+)/)?.[1];
	expect(domain).toBeDefined();

	onTestFinished(() => deleteRepository(domain!, { token, password, host }));

	const repository = await getRepository({ repo: domain!, token, host });
	expect(repository.name).toBe(name);
});
