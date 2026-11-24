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

it("starts without an account when nobody is logged in, and reuses it", async ({
	expect,
	prismic,
	logout,
	token,
	host,
	password,
	onTestFinished,
}) => {
	await logout();
	const env = { CI: "" };

	const claimLinks = new Set<string>();
	for (let i = 0; i < 2; i++) {
		const { stdout, stderr, exitCode } = await prismic("repo", ["create"], {
			nodeOptions: { env },
		});
		expect(exitCode, stderr).toBe(0);
		const domain = stdout.match(/Repository created: (\S+)/)?.[1];
		expect(domain).toBeDefined();
		onTestFinished(() => deleteRepository(domain!, { token, password, host }));
		expect(stderr).toContain(
			"This is a temporary Prismic account. Prismic deletes it and its repositories on Thu, 01 Jan 2099 02:00:00 GMT.",
		);
		const claimLink = stderr.match(
			/To keep them, open this link and sign up or log in:\n {2}(http:\/\/127\.0\.0\.1:\d+\/dashboard\/claim\?code=\S+)/,
		)?.[1];
		expect(claimLink).toBeDefined();
		claimLinks.add(claimLink!);
	}
	expect(claimLinks.size).toBe(1);
});

it("doesn't start without an account on CI", async ({ expect, prismic, logout }) => {
	await logout();
	const { stderr, exitCode } = await prismic("repo", ["create"], {
		nodeOptions: { env: { CI: "true" } },
	});
	expect(exitCode).toBe(1);
	expect(stderr).not.toContain("temporary Prismic account");
	expect(stderr).toContain("Not logged in. Run `prismic login` first.");
});

it.for([
	[429, "Too many accounts were started without signing up from this network today."],
	[503, "Starting without an account isn't available right now."],
] as const)(
	"logs in when Prismic answers %i to starting without an account",
	async ([status, message], { expect, prismic, logout, auth0 }) => {
		await logout();
		auth0.respondOnce("/authentication/guest", { status, body: { error: "unavailable" } });
		const proc = prismic("repo", ["create"], { nodeOptions: { env: { CI: "" } } });
		const output = captureOutput(proc);
		await waitForLoginPrompt(expect, output);
		expect(output()).toContain(message);
	},
);
