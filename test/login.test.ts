import { readFile, stat } from "node:fs/promises";

import { approveLogin, captureOutput, it, waitForLoginPrompt } from "./it";

it("supports --help", async ({ expect, prismic }) => {
	const { stdout, stderr, exitCode } = await prismic("login", ["--help"]);
	expect(exitCode, stderr).toBe(0);
	expect(stdout).toContain("prismic login [options]");
});

it("logs in with a code, and saves the login for this user only", async ({
	expect,
	home,
	prismic,
	login,
	logout,
	auth0,
	token,
}) => {
	const { email } = await login();
	await logout();

	const proc = prismic("login", ["--no-browser"]);
	const output = captureOutput(proc);
	await approveLogin(expect, output, auth0);
	const { exitCode } = await proc;
	expect(exitCode, output()).toBe(0);
	expect(output()).toMatch(
		/Open this URL on any device to log in:\n {2}http:\/\/127\.0\.0\.1:\d+\/activate\?user_code=/,
	);
	expect(output()).toContain(`Check that the page shows the code ${getUserCode(output())}.`);
	expect(output()).toContain(`Logged in to Prismic as ${email}`);
	const deviceCode = auth0.requestsTo("/oauth/token")[0]?.device_code;
	expect(deviceCode).toBeDefined();
	expect(output()).not.toContain(deviceCode);
	expect(output()).not.toContain(token);

	const path = new URL(".config/prismic/credentials.json", home);
	const credentials = await readFile(path, "utf8");
	// The `exec` fixture keeps Linux off the keyring, so its logins go to this file.
	if (process.platform !== "linux") expect(credentials).not.toContain(token);
	if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
});

it("stops an agent at its wait limit, and its next run continues the login", async ({
	expect,
	prismic,
	logout,
	auth0,
}) => {
	await logout();
	const { stdout: taskId } = await prismic("task-id");
	const args = ["--task-id", taskId.trim(), "--user-intent", "Log in to Prismic"];
	const env = { AI_AGENT: "test-agent", PRISMIC_AGENT_WAIT_MS: "1000" };

	const first = await prismic("login", args, { nodeOptions: { env } });
	expect(first.exitCode).toBe(1);
	expect(first.stderr).toContain(
		"Waiting for approval. After the user approves, run the same command again. It continues this login.",
	);

	auth0.approve();
	const second = await prismic("login", args, {
		nodeOptions: { env: { ...env, PRISMIC_AGENT_WAIT_MS: "30000" } },
	});
	expect(second.exitCode, second.stderr).toBe(0);
	expect(getUserCode(first.stderr)).toBeDefined();
	expect(getUserCode(second.stderr)).toBe(getUserCode(first.stderr));
	expect(auth0.requestsTo("/oauth/device/code")).toHaveLength(1);
});

it.skipIf(process.platform === "win32")(
	"cancels on Ctrl-C, and the next run starts a new login",
	async ({ expect, prismic, logout }) => {
		await logout();
		const first = prismic("login");
		const output = captureOutput(first);
		await waitForLoginPrompt(expect, output);
		first.kill("SIGINT");
		const { exitCode } = await first;
		expect(exitCode).toBe(130);
		expect(output()).toContain("Login cancelled.");

		const second = prismic("login");
		const next = captureOutput(second);
		await waitForLoginPrompt(expect, next);
		expect(getUserCode(next())).not.toBe(getUserCode(output()));
	},
);

it("makes another command wait for the login in progress", async ({
	expect,
	prismic,
	logout,
	auth0,
	repo,
}) => {
	await logout();
	const login = prismic("login");
	const repos = prismic("repo", ["list", "--json"], { nodeOptions: { env: { CI: "" } } });
	const loginOutput = captureOutput(login);
	const reposOutput = captureOutput(repos);
	const reposStdout = captureOutput(repos, { stderr: false });
	await waitForLoginPrompt(expect, loginOutput);
	await waitForLoginPrompt(expect, reposOutput);
	expect(getUserCode(reposOutput())).toBe(getUserCode(loginOutput()));

	auth0.approve();
	expect((await login).exitCode, loginOutput()).toBe(0);
	expect((await repos).exitCode, reposOutput()).toBe(0);
	expect(JSON.parse(reposStdout())).toEqual(
		expect.arrayContaining([expect.objectContaining({ domain: repo })]),
	);
	expect(auth0.requestsTo("/oauth/device/code")).toHaveLength(1);
});

it("explains a login that Auth0 refused", async ({ expect, prismic, logout, auth0 }) => {
	await logout();
	const answers = [
		[() => auth0.deny(), "The login was declined in the browser."],
		[
			() => auth0.deny({ description: "email_verification_failed" }),
			"Prismic sent you an email to verify your address. Verify it, then run the command again.",
		],
		[() => auth0.expire(), "The login code expired. Run the command again."],
		[
			() => auth0.respondOnce("/oauth/token", { status: 403, body: { error: "invalid_grant" } }),
			"The login code was already used or isn't valid. Run the command again.",
		],
	] as const;

	const outputs = [];
	for (const [answer, message] of answers) {
		const proc = prismic("login");
		const output = captureOutput(proc);
		await waitForLoginPrompt(expect, output);
		answer();
		expect((await proc).exitCode).toBe(1);
		expect(output()).toContain(message);
		outputs.push(output());
	}
	// Each refused code was deleted, so each run started a new one.
	expect(auth0.requestsTo("/oauth/device/code")).toHaveLength(4);
	for (const { device_code } of auth0.requestsTo("/oauth/token")) {
		expect(outputs.join("\n")).not.toContain(device_code);
	}
});

it("stops a login when another command logs out", async ({ expect, prismic, logout }) => {
	await logout();
	const proc = prismic("login");
	const output = captureOutput(proc);
	await waitForLoginPrompt(expect, output);
	const { exitCode: logoutExitCode, stderr } = await prismic("logout");
	expect(logoutExitCode, stderr).toBe(0);
	expect((await proc).exitCode).toBe(1);
	expect(output()).toContain("A logout cancelled this login. Run the command again to log in.");
});

it("explains a login that isn't set up", async ({ expect, host, prismic, logout }) => {
	await logout();
	const { stderr, exitCode } = await prismic("login", [], {
		nodeOptions: { env: { PRISMIC_AUTH0_CLIENT_ID: "unknown-client" } },
	});
	expect(exitCode).toBe(1);
	expect(stderr).toContain(
		`Login isn't set up correctly for ${host} (invalid_client). Report this: https://github.com/prismicio/cli/issues`,
	);
});

it("revokes the previous session after a new login", async ({ expect, prismic, login, auth0 }) => {
	const refreshToken = auth0.issueRefreshToken();
	await login({ refreshToken });

	const proc = prismic("login");
	await approveLogin(expect, captureOutput(proc), auth0);
	expect((await proc).exitCode).toBe(0);
	const revokes = auth0.requestsTo("/oauth/revoke");
	expect(revokes.map((params) => params.token)).toEqual([refreshToken]);
});

function getUserCode(output: string): string | undefined {
	return output.match(/the code ([A-Z0-9]{4}-[A-Z0-9]{4})/)?.[1];
}
