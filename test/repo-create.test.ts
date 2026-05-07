import { onTestFinished } from "vitest";

import { it } from "./it";
import { deleteRepository, getRepository } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, exitCode } = await prismic("repo", ["create", "--help"]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain("prismic repo create [options]");
});

it("requires --name", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("repo", ["create"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Missing required option: --name");
});

it("creates a repository using --name as the domain", async ({
	expect,
	prismic,
	token,
	host,
	password,
}) => {
	const name = `cli-test-${crypto.randomUUID().slice(0, 8)}`;
	const { stdout, exitCode } = await prismic("repo", ["create", "--name", name]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Repository created: ${name}`);

	onTestFinished(() => deleteRepository(name, { token, password, host }));

	const repository = await getRepository({ repo: name, token, host });
	expect(repository.name).toBe(name);
});

it("rejects a non-kebab-case --name", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("repo", ["create", "--name", "My Test Repo"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Invalid repository name");
});

it("uses --display-name as the repository label", async ({
	expect,
	prismic,
	token,
	host,
	password,
}) => {
	const name = `cli-test-${crypto.randomUUID().slice(0, 8)}`;
	const displayName = "My Display Name";
	const { stdout, exitCode } = await prismic("repo", [
		"create",
		"--name",
		name,
		"--display-name",
		displayName,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Repository created: ${name}`);

	onTestFinished(() => deleteRepository(name, { token, password, host }));

	const repository = await getRepository({ repo: name, token, host });
	expect(repository.name).toBe(displayName);
});

it("fails with guidance when --name is invalid", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("repo", ["create", "--name", "!!"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Invalid repository name");
});
