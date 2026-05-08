import { onTestFinished } from "vitest";

import { it } from "./it";
import { cleanupRepository, getRepository } from "./prismic";

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
	onTestFinished(() => cleanupRepository(name, { token, password, host }));

	const { stdout, exitCode } = await prismic("repo", ["create", "--name", name]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Repository created: ${name}`);

	const repository = await getRepository({ repo: name, token, host });
	expect(repository.name).toBe(name);
});

it("lowercases --name before submitting", async ({
	expect,
	prismic,
	token,
	host,
	password,
}) => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const name = `CLI-Test-${suffix}`;
	const expectedDomain = name.toLowerCase();
	onTestFinished(() => cleanupRepository(expectedDomain, { token, password, host }));

	const { stdout, exitCode } = await prismic("repo", ["create", "--name", name]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Repository created: ${expectedDomain}`);

	const repository = await getRepository({ repo: expectedDomain, token, host });
	expect(repository.name).toBe(expectedDomain);
});

it("rejects --name with disallowed characters", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("repo", ["create", "--name", "My Test Repo"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Invalid name:");
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
	onTestFinished(() => cleanupRepository(name, { token, password, host }));

	const { stdout, exitCode } = await prismic("repo", [
		"create",
		"--name",
		name,
		"--display-name",
		displayName,
	]);
	expect(exitCode).toBe(0);
	expect(stdout).toContain(`Repository created: ${name}`);

	const repository = await getRepository({ repo: name, token, host });
	expect(repository.name).toBe(displayName);
});

it("fails with guidance when --name is invalid", async ({ expect, prismic }) => {
	const tooShort = await prismic("repo", ["create", "--name", "!!"]);
	expect(tooShort.exitCode).toBe(1);
	expect(tooShort.stderr).toContain("Invalid name:");

	const tooLong = await prismic("repo", ["create", "--name", `a${"x".repeat(62)}z`]);
	expect(tooLong.exitCode).toBe(1);
	expect(tooLong.stderr).toContain("Invalid name:");
});
