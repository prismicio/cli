import { fileURLToPath } from "node:url";

import { captureOutput, it, waitForLoginPrompt } from "./it";
import { deleteRepository, getLocales, getMCPActivationStatus, getRepository } from "./prismic";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["create", "--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic repo create [options]");
	expect(stdout).toContain("generates a random domain");
});

it("creates a repository", async ({ expect, prismic, token, host, password, onTestFinished }) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["create"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Repository created:");

	const domain = stdout.match(/Repository created: (\S+)/)?.[1];
	expect(domain).toBeDefined();

	onTestFinished(() => deleteRepository(domain!, { token, password, host }));

	const repository = await getRepository({ repo: domain!, token, host });
	expect(repository.framework).toBe("next");
	expect(repository.quotas?.sliceMachineEnabled).toBe(true);
});

it("fails outside a supported framework project", async ({ expect, prismic, home }) => {
	const { stderr, exitCode } = await prismic("repo", ["create"], {
		nodeOptions: { cwd: fileURLToPath(home) },
	});
	expect(exitCode).toBe(1);
	expect(stderr).toContain("No supported framework found");
});

it("creates a repository with --framework outside a project", async ({
	expect,
	prismic,
	home,
	token,
	host,
	password,
	onTestFinished,
}) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["create", "--framework", "nuxt"], {
		nodeOptions: { cwd: fileURLToPath(home) },
	});
	expect(exitCode, stderr).toBe(0);

	const domain = stdout.match(/Repository created: (\S+)/)?.[1];
	expect(domain).toBeDefined();

	onTestFinished(() => deleteRepository(domain!, { token, password, host }));

	const repository = await getRepository({ repo: domain!, token, host });
	expect(repository.framework).toBe("nuxt");
});

it("rejects an unsupported --framework", async ({ expect, prismic }) => {
	const { stderr, exitCode } = await prismic("repo", ["create", "--framework", "invalid"]);
	expect(exitCode).toBe(1);
	expect(stderr).toContain('Unsupported framework "invalid"');
});

it("creates a repository the Prismic MCP server can use", async ({
	expect,
	prismic,
	token,
	host,
	password,
	onTestFinished,
}) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["create"]);
	expect(exitCode, stderr).toBe(0);

	const domain = stdout.match(/Repository created: (\S+)/)?.[1];
	expect(domain).toBeDefined();

	onTestFinished(() => deleteRepository(domain!, { token, password, host }));

	// The Prismic MCP server is on by default for every new repository.
	const status = await getMCPActivationStatus({ repo: domain!, token, host });
	expect(["active", "activating"]).toContain(status);
});

it("creates a repository with a name", async ({
	expect,
	prismic,
	token,
	host,
	password,
	onTestFinished,
}) => {
	const name = `Test ${crypto.randomUUID().slice(0, 8)}`;
	const { stdout, stderr, exitCode } = await prismic("repo", ["create", "--name", name]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("Repository created:");

	const domain = stdout.match(/Repository created: (\S+)/)?.[1];
	expect(domain).toBeDefined();

	onTestFinished(() => deleteRepository(domain!, { token, password, host }));

	const repository = await getRepository({ repo: domain!, token, host });
	expect(repository.name).toBe(name);
});

it("sets the master locale with --lang", async ({
	expect,
	prismic,
	token,
	host,
	password,
	onTestFinished,
}) => {
	const { stdout, stderr, exitCode } = await prismic("repo", ["create", "--lang", "fr-fr"]);
	expect(exitCode, stderr).toBe(0);

	const domain = stdout.match(/Repository created: (\S+)/)?.[1];
	expect(domain).toBeDefined();

	onTestFinished(() => deleteRepository(domain!, { token, password, host }));

	const locales = await getLocales({ repo: domain!, token, host });
	const master = locales.find((locale) => locale.isMaster);
	expect(master?.id).toBe("fr-fr");
});

it("starts a temporary account when not logged in, and picks it up again after a logout", async ({
	expect,
	prismic,
	logout,
	token,
	host,
	password,
	onTestFinished,
}) => {
	await logout();

	const claimLinks = [];
	for (let i = 0; i < 2; i++) {
		const { stdout, stderr, exitCode } = await prismic("repo", ["create"], {
			nodeOptions: { env: { CI: "" } },
		});
		expect(exitCode, stderr).toBe(0);
		const domain = stdout.match(/Repository created: (\S+)/)?.[1];
		expect(domain).toBeDefined();
		onTestFinished(() => deleteRepository(domain!, { token, password, host }));
		claimLinks.push(
			stderr.match(
				/Temporary account, frozen in [\d,]+ days \(2099-01-01T02:00Z\), deleted in [\d,]+ days \(2099-01-15T02:00Z\)\. Claim it to keep your work: (http:\/\/127\.0\.0\.1:\d+\/dashboard\/claim\?code=\S+)/,
			)?.[1],
		);
		await prismic("logout");
	}
	expect(claimLinks[0]).toBeDefined();
	expect(claimLinks[1]).toBe(claimLinks[0]);
});

it("doesn't start a new temporary account to get around a frozen one", async ({
	expect,
	prismic,
	login,
}) => {
	await login({
		guest: {
			claimUrl: "https://example.com/claim",
			expiresAt: Date.now() - 60_000,
			deletesAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
		},
	});
	await prismic("logout");
	const { stderr, exitCode } = await prismic("repo", ["create"], {
		nodeOptions: { env: { CI: "" } },
	});
	expect(exitCode).toBe(1);
	expect(stderr).toContain("Your temporary account is frozen. Claim it to carry on.");
	expect(stderr).toContain("Claim it to keep your work: https://example.com/claim");
});

it("doesn't start a temporary account on CI", async ({ expect, prismic, logout }) => {
	await logout();
	const { stderr, exitCode } = await prismic("repo", ["create"], {
		nodeOptions: { env: { CI: "true" } },
	});
	expect(exitCode).toBe(1);
	expect(stderr).not.toContain("Temporary account");
	expect(stderr).toContain("Not logged in. Run `prismic login` first.");
});

it("logs in when Prismic can't start a temporary account", async ({
	expect,
	prismic,
	logout,
	auth0,
}) => {
	for (const status of [429, 409, 500]) {
		await logout();
		auth0.respondOnce("/authentication/guest", { status });
		const proc = prismic("repo", ["create"], { nodeOptions: { env: { CI: "" } } });
		const output = captureOutput(proc);
		await waitForLoginPrompt(expect, output);
		expect(output()).toContain("Couldn't start a temporary account.");
		proc.kill();
	}
});
