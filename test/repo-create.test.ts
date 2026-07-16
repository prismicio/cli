import { onTestFinished } from "vitest";

import { it } from "./it";
import { deleteRepository, getLocales, getMCPActivationStatus, getRepository } from "./prismic";

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

it("activates the MCP server", async ({ expect, prismic, token, host }) => {
	const { stdout, exitCode } = await prismic("repo", ["create"]);
	expect(exitCode).toBe(0);

	const domain = stdout.match(/Repository created: (\S+)/)?.[1];
	expect(domain).toBeDefined();

	// New repositories are activated for the Prismic MCP server. Once they are
	// MCP-enabled server-side by default, this will pass regardless of the CLI.
	const status = await getMCPActivationStatus({ repo: domain!, token, host });
	expect(["active", "activating"]).toContain(status);
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

it("sets the master locale with --lang", async ({ expect, prismic, token, host, password }) => {
	const { stdout, exitCode } = await prismic("repo", ["create", "--lang", "fr-fr"]);
	expect(exitCode).toBe(0);

	const domain = stdout.match(/Repository created: (\S+)/)?.[1];
	expect(domain).toBeDefined();

	onTestFinished(() => deleteRepository(domain!, { token, password, host }));

	const locales = await getLocales({ repo: domain!, token, host });
	const master = locales.find((locale) => locale.isMaster);
	expect(master?.id).toBe("fr-fr");
});
